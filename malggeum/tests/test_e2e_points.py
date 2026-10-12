import json
import subprocess

import pytest
from fastapi.testclient import TestClient

from malggeum.server import create_app
from tests.conftest import FakeBackend
from tests.fixtures import make_lecture
from tests.test_e2e import upload, wait_done


@pytest.fixture(scope="module")
def lecture_video(tmp_path_factory):
    tr, x, dur, spans = make_lecture()
    gate = "+".join(f"between(t\\,{s:.2f}\\,{e:.2f})" for s, e in spans)
    p = tmp_path_factory.mktemp("lec") / "lecture.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=gray:s=640x360:d={dur:.1f}:r=30",
                    "-f", "lavfi", "-i", f"aevalsrc=0.1*sin(2*PI*180*t)*({gate}):s=16000:d={dur:.1f}",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(p)], check=True)
    return p, tr


@pytest.fixture
def ctx(tmp_path, lecture_video, monkeypatch):
    import malggeum.pipeline as pl
    monkeypatch.setattr(pl, "MIN_STAGE", 0)
    _, tr = lecture_video
    with TestClient(create_app(workdir=tmp_path / "w", backend=FakeBackend(tr), draft_root=tmp_path / "d")) as c:
        yield c, tmp_path


def load_draft(tmp, res):
    return json.loads((tmp / "d" / res["draft_name"] / "draft_content.json").read_text("utf-8"))


def run(client, video, **form):
    jid = upload(client, video, **form)
    evs = wait_done(client, jid)
    assert evs[-1]["type"] == "done", evs[-1]
    return jid, client.get(f"/api/jobs/{jid}").json()["result"]


def test_presets_endpoint(ctx):
    client, _ = ctx
    p = client.get("/api/presets").json()
    assert set(p) == {"shorts", "longform", "lecture"} and p["shorts"]["canvas"] == "9:16"


def test_shorts_workflow_draft(ctx, lecture_video):
    client, tmp = ctx
    jid, res = run(client, lecture_video[0], workflow="shorts")
    d = load_draft(tmp, res)
    assert (d["canvas_config"]["width"], d["canvas_config"]["height"]) == (1080, 1920)
    vt = next(t for t in d["tracks"] if t["type"] == "video")
    scales = {round(s["clip"]["scale"]["x"], 3) for s in vt["segments"]}
    base = 1920 / (1080 * 360 / 640)
    assert any(abs(s - base) < 0.01 for s in scales) and any(abs(s - base * 1.15) < 0.01 for s in scales)   # 리프레임 + 리듬 줌
    assert res["point_counts"]["hook"] == 1 and res["teaser_len"] > 1.0 and res["point_counts"]["emphasis"] >= 3
    names = [t.get("name") for t in d["tracks"] if t["type"] == "text"]
    assert "keyword" in names and "subtitle" in names
    pops = [m["content"] for m in d["materials"]["texts"]]
    assert any("3개월" in p for p in pops) and any("70퍼센트" in p for p in pops)
    for a, b in zip(vt["segments"], vt["segments"][1:]):
        assert a["target_timerange"]["start"] + a["target_timerange"]["duration"] == b["target_timerange"]["start"]
    assert abs(d["duration"] / 1e6 - res["out_duration"]) < 0.05


def test_lecture_workflow_has_no_zoom_or_hook(ctx, lecture_video):
    client, tmp = ctx
    _, res = run(client, lecture_video[0], workflow="lecture")
    d = load_draft(tmp, res)
    assert (d["canvas_config"]["width"], d["canvas_config"]["height"]) == (640, 360)
    vt = next(t for t in d["tracks"] if t["type"] == "video")
    assert all(abs(s["clip"]["scale"]["x"] - 1.0) < 1e-6 for s in vt["segments"])
    assert res["teaser_len"] == 0 and res["point_counts"]["zoom"] == 0


def test_feature_override_and_point_toggle(ctx, lecture_video):
    client, tmp = ctx
    jid, res = run(client, lecture_video[0], workflow="shorts", features=json.dumps({"hook": False, "zoom": False}))
    assert res["point_counts"]["hook"] == 0 and res["point_counts"]["zoom"] == 0
    pop = next(p for p in res["points"] if p["kind"] == "emphasis")
    r2 = client.post(f"/api/jobs/{jid}/rebuild", json={"point_toggles": {pop["key"]: False}}).json()
    assert r2["point_counts"]["emphasis"] == res["point_counts"]["emphasis"] - 1
    assert next(p for p in r2["points"] if p["key"] == pop["key"])["enabled"] is False


def test_glossary_applied_to_subtitles(ctx, lecture_video):
    client, tmp = ctx
    _, res = run(client, lecture_video[0], workflow="longform", glossary="채권관리=채권 관리")
    d = load_draft(tmp, res)
    assert any("채권 관리" in m["content"] for m in d["materials"]["texts"])


def test_shorts_clip_from_highlight(ctx, lecture_video):
    client, tmp = ctx
    jid, res = run(client, lecture_video[0], workflow="longform")
    assert res["highlights"], "숏츠 후보 없음"
    h = res["highlights"][0]
    r = client.post(f"/api/jobs/{jid}/clip", json={"start": h["start"], "end": h["end"]})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["canvas"] == [1080, 1920] and 5 < out["out_duration"] <= 61
    assert (tmp / "d" / out["draft_name"] / "draft_content.json").exists()
    assert client.post(f"/api/jobs/{jid}/clip", json={"start": 1, "end": 2}).status_code == 400
    assert client.post("/api/jobs", files={"file": ("a.mp4", b"x")}, data={"workflow": "nope"}).status_code == 400
