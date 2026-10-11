import json
import subprocess
import time
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from capcut_agent import audio, plan as PL, render as R
from capcut_agent.asr import Segment, Transcript, Word
from capcut_agent.server import create_app
from tests.conftest import FakeBackend
from tests.test_e2e import upload, wait_done


def streams(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
                         capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    v = next(s for s in d["streams"] if s["codec_type"] == "video")
    a = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    return v, a, float(d["format"]["duration"])


def frame(path, t, w, h):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-f", "rawvideo",
                          "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(h, w).astype(int)


@pytest.fixture
def plan_and_info(video, transcript):
    info = audio.probe(str(video))
    x = audio.load_pcm(str(video))
    return info, x, transcript


def test_even_and_clip_filters():
    assert R.even(641) in (640, 642) and R.even(1) == 2
    info = {"width": 1920, "height": 1080, "fps": 30}

    class C:
        scale, volume = 1.15, 1.2
    class P:
        base_scale = 1920 / (1080 * 1080 / 1920)
        enhance = False
    vf, af = R.clip_filters(info, P, (1080, 1920), C)
    assert "crop=1080:1920" in vf and "pad" not in vf and "volume=1.200" in af     # 9:16 꽉 채움 + 줌 + 음량
    assert "afftdn" not in af
    P.enhance = True
    assert "afftdn" in R.clip_filters(info, P, (1080, 1920), C)[1]                  # 음질 보정 켜면 노이즈 제거 포함


def test_ass_contains_korean_pop_and_chapter(plan_and_info):
    info, x, tr = plan_and_info
    pl = PL.build(tr, x, [(0.0, 2.0), (4.0, 6.0)], info, workflow="shorts")
    ass = R.build_ass(pl, "Noto Sans CJK KR", (1080, 1920))
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    assert "오늘은" in ass and "Style: Pop" in ass and "Style: Chap" in ass
    assert "\\t(0,140" in ass or not any(o.kind == "pop" for o in pl.overlays)          # 팝업 등장 애니메이션
    assert R._t(3725.5) == "1:02:05.50" and "{" not in R._esc("a{b}c")


def test_render_burns_subtitles_and_matches_plan(plan_and_info, tmp_path):
    info, x, tr = plan_and_info
    pl = PL.build(tr, x, [(0.0, 2.0), (4.0, 6.0)], info, workflow="longform", features={"hook": False})
    on, off = tmp_path / "on.mp4", tmp_path / "off.mp4"
    pcts = []
    R.render(str(SRC["p"]), info, pl, on, tmp_path / "w1", on_progress=pcts.append)
    R.render(str(SRC["p"]), info, pl, off, tmp_path / "w2", on_progress=lambda f: None, with_subs=False)
    v, a, dur = streams(on)
    assert a is not None and (v["width"], v["height"]) == (640, 360)
    assert abs(dur - pl.out_duration) < 0.3 and pcts[-1] == 1.0 and pcts == sorted(pcts)
    t = pl.subs[0].start + 0.3
    diff = np.abs(frame(on, t, 640, 360) - frame(off, t, 640, 360))
    assert (diff > 60).sum() > 200, "자막이 영상에 구워지지 않음"
    assert diff[:200].sum() == 0                                  # 자막은 화면 아래쪽에만


SRC = {}


@pytest.fixture(autouse=True)
def _remember(video):
    SRC["p"] = video


def test_shorts_canvas_is_9x16_and_chunked_render_matches(plan_and_info, tmp_path, monkeypatch):
    info, x, tr = plan_and_info
    pl = PL.build(tr, x, [(0.0, 2.0), (4.0, 6.0)], info, workflow="shorts", features={"hook": False})
    one, many = tmp_path / "one.mp4", tmp_path / "many.mp4"
    R.render(str(SRC["p"]), info, pl, one, tmp_path / "w1", on_progress=lambda f: None)
    monkeypatch.setattr(R, "MAX_INPUTS", 1)                       # 청크 경로 강제
    R.render(str(SRC["p"]), info, pl, many, tmp_path / "w2", on_progress=lambda f: None)
    for f in (one, many):
        v, a, dur = streams(f)
        assert (v["width"], v["height"]) == (1080, 1920) and a is not None and abs(dur - pl.out_duration) < 0.4
    assert abs(streams(one)[2] - streams(many)[2]) < 0.3
    assert not list((tmp_path / "w2").glob("chunk_*.mkv"))        # 중간 파일 정리


def test_cancel_stops_render(plan_and_info, tmp_path):
    import threading
    info, x, tr = plan_and_info
    pl = PL.build(tr, x, [(0.0, 2.0), (4.0, 6.0)], info, workflow="longform")
    ev = threading.Event()
    ev.set()
    with pytest.raises(R.RenderCancelled):
        R.render(str(SRC["p"]), info, pl, tmp_path / "x.mp4", tmp_path / "w", on_progress=lambda f: None, cancel=ev)


@pytest.fixture
def client(tmp_path, transcript, monkeypatch):
    import capcut_agent.pipeline as pl
    monkeypatch.setattr(pl, "MIN_STAGE", 0)
    with TestClient(create_app(workdir=tmp_path / "w", backend=FakeBackend(transcript), draft_root=tmp_path / "d")) as c:
        yield c


def wait_render(client, jid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = client.get(f"/api/jobs/{jid}").json()["render"]
        if r["state"] in ("done", "error"):
            return r
        time.sleep(0.3)
    raise AssertionError("렌더 시간 초과")


def test_full_auto_upload_to_mp4_and_rerender_on_edit(client, video):
    jid = upload(client, video, render="true", workflow="longform")
    evs = wait_done(client, jid)
    assert evs[-1]["type"] == "done" and any(e["type"] == "progress" and e["key"] == "render" for e in evs)
    job = client.get(f"/api/jobs/{jid}").json()
    assert job["render"]["state"] == "done" and job["render"]["size"] > 1000
    r = client.get(f"/api/jobs/{jid}/mp4")
    assert r.status_code == 200 and r.headers["content-type"] == "video/mp4" and len(r.content) == job["render"]["size"]
    assert "attachment" in client.get(f"/api/jobs/{jid}/mp4?dl=1").headers["content-disposition"]
    first = job["result"]["out_duration"]

    ng = next(c for c in job["result"]["cuts"] if c["kind"] == "ng")                      # NG를 되살리면 길어져야 함
    res = client.post(f"/api/jobs/{jid}/rebuild", json={"toggles": {ng["id"]: False}}).json()
    assert res["out_duration"] > first + 1.0
    rend = wait_render(client, jid)
    assert rend["state"] == "done"
    v, a, dur = streams(Path(rend["path"]))
    assert abs(dur - res["out_duration"]) < 0.4


def test_render_off_skips_and_mp4_not_ready(client, video):
    jid = upload(client, video, render="false")
    wait_done(client, jid)
    assert client.get(f"/api/jobs/{jid}").json()["render"]["state"] == "skipped"
    assert client.get(f"/api/jobs/{jid}/mp4").status_code == 409
    assert client.post(f"/api/jobs/{jid}/render").status_code == 200
    assert wait_render(client, jid)["state"] == "done"
