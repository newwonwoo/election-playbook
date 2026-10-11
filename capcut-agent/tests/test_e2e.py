import json
import time

import pytest
from fastapi.testclient import TestClient

from capcut_agent import audio
from capcut_agent.server import create_app
from tests.conftest import FakeBackend



@pytest.fixture
def ctx(tmp_path, transcript, monkeypatch):
    monkeypatch.setenv("CAPCUT_MIN_STAGE", "0")
    import capcut_agent.pipeline as pl
    monkeypatch.setattr(pl, "MIN_STAGE", 0)
    be = FakeBackend(transcript)
    app = create_app(workdir=tmp_path / "w", backend=be, draft_root=tmp_path / "drafts")
    with TestClient(app) as client:      # 컨텍스트 유지 → 백그라운드 태스크가 같은 루프에서 산다
        yield client, be, tmp_path


def upload(client, video, **form):
    with open(video, "rb") as f:
        r = client.post("/api/jobs", files={"file": ("talk.mp4", f, "video/mp4")}, data=form)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def wait_done(client, jid):
    with client.stream("GET", f"/api/jobs/{jid}/events") as r:
        evs = [json.loads(l[6:]) for l in r.iter_lines() if l.startswith("data: ")]
    return evs


def test_probe_and_speech_on_synthetic(video):
    info = audio.probe(str(video))
    assert abs(info["duration"] - 8) < 0.2 and info["width"] == 640
    sp, thr = audio.detect_speech(audio.load_pcm(str(video)))
    assert len(sp) == 2 and abs(sp[0][0]) < 0.1 and abs(sp[0][1] - 2) < 0.15 and abs(sp[1][0] - 4) < 0.15


def test_full_pipeline_and_draft(ctx, video):
    client, be, tmp = ctx
    jid = upload(client, video)
    evs = wait_done(client, jid)
    order = [e["key"] for e in evs if e["type"] == "stage" and e["state"] == "done"]
    assert order == ["silence", "asr", "filler", "points", "draft"] and evs[-1]["type"] == "done"

    res = client.get(f"/api/jobs/{jid}").json()["result"]
    assert res["counts"]["ng"] == 1 and res["counts"]["filler"] == 1 and res["counts"]["silence"] >= 2
    assert 1.2 < res["out_duration"] < 2.0 and res["saved_pct"] > 70      # 대부분 걸러지고 B 문장만 남음
    assert res["peaks"] and res["asr"]["cached"] is False

    d = tmp / "drafts" / res["draft_name"]
    content = json.loads((d / "draft_content.json").read_text("utf-8"))
    meta = json.loads((d / "draft_meta_info.json").read_text("utf-8"))
    assert meta["tm_duration"] == content["duration"] > 0 and meta["draft_name"] == res["draft_name"]
    tracks = {t["type"]: t for t in content["tracks"]}
    segs = tracks["video"]["segments"]
    assert segs[0]["target_timerange"]["start"] == 0
    for a, b in zip(segs, segs[1:]):                                      # 타임라인 갭 없음
        assert a["target_timerange"]["start"] + a["target_timerange"]["duration"] == b["target_timerange"]["start"]
    assert sum(s["target_timerange"]["duration"] for s in segs) == content["duration"]
    texts = [m["content"] for m in content["materials"]["texts"]]
    assert texts and not any("음 " in t for t in texts)
    assert client.get(f"/api/jobs/{jid}/srt").status_code == 200


def test_asr_cache_and_rebuild_without_asr(ctx, video):
    client, be, _ = ctx
    j1 = upload(client, video); wait_done(client, j1)
    j2 = upload(client, video); wait_done(client, j2)
    assert be.calls == 1 and client.get(f"/api/jobs/{j2}").json()["result"]["asr"]["cached"] is True

    r1 = client.get(f"/api/jobs/{j1}").json()["result"]
    ng = next(c for c in r1["cuts"] if c["kind"] == "ng")
    r2 = client.post(f"/api/jobs/{j1}/rebuild", json={"toggles": {ng["id"]: False}, "keep_marks": []}).json()
    assert r2["out_duration"] > r1["out_duration"] + 1.0 and be.calls == 1   # NG 복원, ASR 재호출 없음
    r3 = client.post(f"/api/jobs/{j1}/rebuild", json={"toggles": {}, "keep_marks": [[2.5, 3.5]]}).json()
    assert any(abs(s - 2.5) < 1e-6 for s, e in r3["keep"])                   # 사용자 보존 구간


def test_rejects_bad_ext_and_missing_audio(ctx, tmp_path):
    client, *_ = ctx
    r = client.post("/api/jobs", files={"file": ("a.txt", b"x", "text/plain")})
    assert r.status_code == 400
    assert client.get("/api/jobs/nope").status_code == 404


def test_corrupt_video_reports_error(ctx, tmp_path):
    client, *_ = ctx
    bad = tmp_path / "bad.mp4"; bad.write_bytes(b"not a video")
    jid = upload(client, bad)
    evs = wait_done(client, jid)
    assert evs[-1]["type"] == "error"


def test_env_endpoint(ctx):
    client, *_ = ctx
    d = client.get("/api/env").json()
    assert d["track"] in ("A", "C", "fallback") and d["ready"] is True


def test_silent_video_gives_clear_error(ctx, tmp_path):
    import subprocess
    quiet = tmp_path / "quiet.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=320x240:d=3:r=30",
                    "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", str(quiet)], check=True)
    client, *_ = ctx
    evs = wait_done(client, upload(client, quiet))
    assert evs[-1]["type"] == "error" and "남는 구간" in evs[-1]["message"]


def test_index_served_and_options_forwarded(ctx, video):
    client, be, _ = ctx
    html = client.get("/").text
    assert "캡컷 에이전트" in html and "EventSource" in html
    jid = upload(client, video, threshold_db="-40", pad="0", aggressive="true", subtitles="false")
    wait_done(client, jid)
    res = client.get(f"/api/jobs/{jid}").json()["result"]
    assert res["threshold_db"] == -40.0
