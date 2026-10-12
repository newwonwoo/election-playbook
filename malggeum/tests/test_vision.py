import subprocess
import tempfile
import threading
import time
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from malggeum import clef, clips, media, vision as V
from malggeum.asr import Segment, Transcript, Word
from malggeum.server import create_app
from tests.fakecf import FakeCF
from tests.test_e2e import wait_done


class PixelModel:
    """가짜 Clef-omni: 받은 영상 조각을 진짜로 디코딩해서 흰 사각형의 위치/배경 밝기를 보고 답한다."""

    def __init__(self):
        self.seen = []

    def _look(self, data: bytes):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "c.mp4"
            f.write_bytes(data)
            raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "1", "-i", str(f), "-frames:v", "1", "-vf", "scale=64:36",
                                  "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
        img = np.frombuffer(raw, dtype=np.uint8).reshape(36, 64).astype(float)
        mask = img > 200
        cx = float(np.nonzero(mask)[1].mean() / 63) if mask.sum() > 3 else None
        return cx, float(img.mean())

    def __call__(self, qid, q, videos, body):
        if not videos:                                   # 영상 없는 요청(연결 확인): 그냥 예라고 답한다
            return {"type": "noul", "noul": 0.9}
        key = id(body)
        if getattr(self, "_k", None) != key:
            self._k = key
            self._v = self._look(videos[0])
            self.seen.append(self._v)
        cx, mean = self._v
        if qid == "face":
            return {"type": "noul", "noul": 0.95 if cx is not None else 0.05}
        if qid == "face_pos":
            opts = list(q["criteria"])
            if cx is None:
                probs = {o: (0.9 if o == "none" else 0.02) for o in opts}
            else:
                centers = V.POS_CENTER
                near = min(centers, key=lambda k: abs(centers[k] - cx))
                probs = {o: (0.8 if o == near else 0.2 / (len(opts) - 1)) for o in opts}
            s = sum(probs.values())
            probs = {k: v / s for k, v in probs.items()}
            return {"type": "choice", "choice": max(probs, key=probs.get), "probabilities": probs, "confidence": max(probs.values())}
        if qid == "dark":
            return {"type": "noul", "noul": 0.95 if mean < 20 else 0.05}
        if q["type"] == "score":
            n = len(q["criteria"])
            return {"type": "score", "score": 0.0 if qid == "shaky" else 1.0, "legend": {}, "probabilities": {str(i): 1 / n for i in range(n)}, "confidence": 0.5}
        return {"type": "noul", "noul": {"speaking": 0.9, "selfc": 0.6, "hook": 0.3, "hesitate": 0.1, "noise": 0.1, "slides": 0.1}.get(qid, 0.5)}


def make_square_video(path, dark_middle=False):
    """24초, 8초마다 흰 사각형이 15% → 50% → 85% 위치. 배경은 회색(또는 가운데 8초만 검정). 소리는 계속 켜져 있어 무음 컷이 없다."""
    boxes = "".join(f",drawbox=x=iw*{x}-50:y=310:w=100:h=100:color=white:t=fill:enable='between(t,{a},{b})'"
                    for x, a, b in ((0.15, 0, 8), (0.5, 8, 16), (0.85, 16, 24)))
    bg = "color=c=0x3c3c3c:s=1280x720:d=24:r=24"
    dark = ",drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,8,16)'" if dark_middle else ""
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", bg, "-f", "lavfi", "-i", "sine=f=300:d=24",
                    "-vf", (dark.lstrip(",") + boxes) if dark else boxes.lstrip(","),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(path)], check=True)


@pytest.fixture(scope="module")
def sq(tmp_path_factory):
    p = tmp_path_factory.mktemp("vis") / "sq.mp4"
    make_square_video(p)
    return p


@pytest.fixture(scope="module")
def sq_dark(tmp_path_factory):
    p = tmp_path_factory.mktemp("vis2") / "sqd.mp4"
    make_square_video(p, dark_middle=True)
    return p


class Backend:
    name = "fake"

    TEXT = ["하나 둘 셋 넷", "다섯 여섯 일곱 여덟", "아홉 열 열하나 열둘"]       # 서로 달라야 한다(같으면 '재촬영'으로 보고 앞부분을 NG로 자른다)

    def transcribe(self, samples, model):
        segs = [Segment(a + 0.2, a + 7.8, txt, [Word(a + 0.2 + i * 1.8, a + 1.8 + i * 1.8, w) for i, w in enumerate(txt.split())])
                for a, txt in zip((0, 8, 16), self.TEXT)]
        return Transcript("ko", segs)


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    import malggeum.pipeline as pl
    monkeypatch.setattr(pl, "MIN_STAGE", 0)


@pytest.fixture
def cf():
    model = PixelModel()
    f = FakeCF(handler=model)
    f.model = model
    yield f
    f.close()


def src_of(p, dur=24.0):
    s = media.Src("sq.mp4", str(p), 0.0, dur, 1280, 720, 24)
    return [s]


def mk_client(cf, **kw):
    return clef.ClefClient("acct123", "good-token", base=cf.url, sleep=lambda s: None, **kw)


# ---------- 단위 ----------
def test_windows_split_per_source_and_merge_short_tail():
    a, b = media.Src("a", "/a", 0, 20), media.Src("b", "/b", 20, 8.5)
    assert clips.windows([a], 8, 3) == [(0, 8), (8, 16), (16, 20)]            # 마지막 4초는 3초 이상이라 따로
    assert clips.windows([a, b], 8, 3)[-1] == (20, 28.5)                       # 영상 경계를 넘지 않고, 8.5초는 한 구간
    assert clips.windows([media.Src("c", "/c", 0, 17)], 8, 3) == [(0, 8), (8, 17)]     # 꼬리 1초는 앞 구간에 합침
    assert clips.locate([a, b], 21).name == "b" and clips.locate([a, b], 5).name == "a"


def test_derive_focus_from_probabilities():
    def fp(**p):
        probs = {k: p.get(k, 0.0) for k in V.POS_CENTER} | {"none": p.get("none", 0.0)}
        return {"type": "choice", "choice": "x", "probs": probs, "conf": 1.0}
    d = V.derive({"face": {"type": "noul", "p": 0.9}, "face_pos": fp(left=0.5, center=0.5)})
    assert abs(d["focus"] - 0.4) < 1e-6                                          # 확률 가중 평균
    assert V.derive({"face": {"type": "noul", "p": 0.3}, "face_pos": fp(left=1.0)})["focus"] is None      # 얼굴 확률이 낮으면 중앙
    assert V.derive({"face": {"type": "noul", "p": 0.9}, "face_pos": fp(none=0.8, left=0.2)})["focus"] is None
    assert V.derive({})["focus"] is None and V.derive({})["face"] is None


def test_focus_at_does_not_blur_real_movement_at_the_edges():
    vis = {"windows": [{"start": 0, "end": 8, "focus": 0.18}, {"start": 8, "end": 16, "focus": 0.5}, {"start": 16, "end": 24, "focus": 0.82}]}
    assert V.focus_at(vis, 0, 8) == 0.18 and V.focus_at(vis, 16, 24) == 0.82        # 가장자리는 자기 값 (이웃과 섞이면 틀림)
    assert V.focus_at(vis, 8, 16) == 0.5                                              # 가운데는 3개 중앙값 = 자기 값


def test_split_by_focus_follows_a_moving_subject_without_changing_timing():
    from malggeum.plan import Clip
    vis = {"windows": [{"start": 0, "end": 8, "focus": 0.18}, {"start": 8, "end": 16, "focus": 0.5}, {"start": 16, "end": 24, "focus": 0.5},
                       {"start": 24, "end": 32, "focus": None}]}
    out = V.split_by_focus([Clip(0, 32, scale=1.15, volume=0.8)], vis)
    assert [(c.src_s, c.src_e, c.focus) for c in out] == [(0, 8, 0.18), (8, 24, 0.5), (24, 32, None)]   # 같은 위치가 이어지면 합쳐 둠, 얼굴 없으면 None
    assert all(c.scale == 1.15 and c.volume == 0.8 for c in out)                       # 줌·음량은 그대로 복사
    assert sum(c.src_e - c.src_s for c in out) == 32 and out[0].src_s == 0 and out[-1].src_e == 32
    short = V.split_by_focus([Clip(7.8, 8.2)], vis)                                    # 0.5초 미만 조각은 만들지 않는다
    assert len(short) == 1


def test_focus_at_smooths_with_median_of_neighbours():
    vis = {"windows": [{"start": 0, "end": 8, "focus": 0.5}, {"start": 8, "end": 16, "focus": 0.9}, {"start": 16, "end": 24, "focus": 0.5}]}
    assert V.focus_at(vis, 9, 10) == 0.5                                          # 튀는 한 구간은 이웃 중앙값으로 눌러 줌
    assert V.focus_at(vis, 30, 31) is None and V.focus_at(None, 0, 1) is None
    vis["windows"][1]["focus"] = None
    assert V.focus_at(vis, 9, 10) is None


# ---------- 구간 분석 ----------
def test_analyze_finds_square_position_per_window_and_caches(cf, sq, tmp_path):
    cache = clef.AnswerCache(tmp_path / "c.jsonl")
    c = mk_client(cf, cache=cache)
    prog = []
    res = V.analyze(src_of(sq), c, progress=prog.append)
    foc = [w["focus"] for w in res["windows"]]
    assert len(foc) == 3 and abs(foc[0] - 0.15) < 0.1 and abs(foc[1] - 0.5) < 0.05 and abs(foc[2] - 0.85) < 0.1, foc
    assert all(w["face"] > 0.9 and w["dark"] < 0.1 for w in res["windows"])
    assert len(cf.requests) == 3 and len(cf.requests[0]["body"]["questions"]) == len(V.QUESTIONS)     # 구간당 요청 1번
    assert prog == sorted(prog) and prog[-1] == 1.0 and res["cost_usd"] > 0
    V.analyze(src_of(sq), mk_client(cf, cache=cache))
    assert len(cf.requests) == 3                                                   # 같은 영상은 다시 과금되지 않음


def test_analyze_cancel_and_auth_error(cf, sq):
    ev = threading.Event()
    ev.set()
    with pytest.raises(V.Cancelled):
        V.analyze(src_of(sq), mk_client(cf), cancel=ev)
    assert cf.requests == []
    with pytest.raises(clef.ClefAuthError):
        V.analyze(src_of(sq), clef.ClefClient("acct123", "WRONG", base=cf.url, sleep=lambda s: None))


def test_suggest_cuts_merge_and_source_scores():
    vis = {"windows": [
        {"start": 0, "end": 8, "dark": 0.95, "shaky": 0.1, "face": 0.9, "energy": 1.5, "hesitate": 0.1, "selfc": 0.5, "focus": 0.5},
        {"start": 8, "end": 16, "dark": 0.95, "shaky": 0.1, "face": 0.9, "energy": 1.5, "hesitate": 0.1, "selfc": 0.5, "focus": 0.5},
        {"start": 16, "end": 24, "dark": 0.1, "shaky": 1.8, "face": 0.9, "energy": 1.5, "hesitate": 0.1, "selfc": 0.5, "focus": 0.5}]}
    sg = V.suggest_cuts(vis)
    assert sg == [(0, 16, "AI: 너무 어둡거나 밝음"), (16, 24, "AI: 흔들림·흐림")]
    a, b = media.Src("a.mp4", "/a", 0, 16), media.Src("b.mp4", "/b", 16, 8)
    sc = V.source_scores(vis, [a, b])
    assert sc[0]["windows"] == 2 and sc[1]["windows"] == 1 and sc[0]["score"] > sc[1]["score"] - 5
    assert V.estimate([a, b])["windows"] == 3 and V.estimate([a, b])["cost_usd"] > 0


# ---------- 끝에서 끝까지 ----------
def app(tmp, cf):
    return TestClient(create_app(workdir=tmp / "w", backend=Backend(), draft_root=tmp / "d", clef_base=cf.url))


def connect(c, token="good-token"):
    assert c.post("/api/clef/settings", json={"account_id": "acct123", "token": token}).status_code == 200


def upload(c, video, **form):
    form.setdefault("render", "false")
    r = c.post("/api/jobs", files=[("files", (video.name, video.read_bytes(), "video/mp4"))], data=form)
    assert r.status_code == 200, r.text
    jid = r.json()["id"]
    evs = wait_done(c, jid)
    assert evs[-1]["type"] == "done", evs[-1]
    return jid, c.get(f"/api/jobs/{jid}").json(), evs


def pixel(path, t, x=0.5, y=0.5):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=20:20",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    i = (int(y * 19) * 20 + int(x * 19)) * 3
    return tuple(raw[i:i + 3])


def white_cx(path, t):
    """프레임에서 흰 픽셀(사각형)의 가로 무게중심(0~1). 안 보이면 None."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=54:96",
                          "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    img = np.frombuffer(raw, dtype=np.uint8).reshape(96, 54)
    cols = np.nonzero(img > 200)[1]
    return float(cols.mean() / 53) if len(cols) > 20 else None


NO_FX = '{"hook": false, "zoom": false, "chapters": false, "enhance": false, "loudness": false}'


def test_smart_reframe_keeps_the_subject_centered_in_9x16(cf, sq, tmp_path):
    with app(tmp_path, cf) as c:
        connect(c)
        _, with_ai, _ = upload(c, sq, workflow="shorts", render="true", ai="true", features=NO_FX)
        _, without, _ = upload(c, sq, workflow="shorts", render="true", features=NO_FX)
        assert with_ai["result"]["vision"]["reframe"] is True and without["result"]["vision"] is None
        a, b = Path(with_ai["render"]["path"]), Path(without["render"]["path"])
        for t in (4, 12, 20):                                                       # 사각형이 원본의 왼쪽/가운데/오른쪽에 있는 세 시점
            cx = white_cx(a, t)
            print("  reframe cx@%ds = %.3f" % (t, cx))
            assert cx is not None and abs(cx - 0.5) < 0.2, (t, cx)                  # AI 리프레임: 사각형이 세로 화면의 가운데 부근에 온다
        assert white_cx(b, 4) is None and white_cx(b, 20) is None                   # 대조군(중앙 크롭): 양끝의 사각형은 아예 잘려 나감
        assert abs(white_cx(b, 12) - 0.5) < 0.05                                    # 가운데 사각형은 중앙 크롭에서도 보임 → 대조가 공정함
        d = __import__("json").loads((tmp_path / "d" / with_ai["result"]["draft_name"] / "draft_content.json").read_text("utf-8"))
        vt = next(t for t in d["tracks"] if t["type"] == "video")
        tx = [s["clip"]["transform"]["x"] for s in vt["segments"]]
        assert tx[0] > 0.2 and abs(tx[1]) < 0.05 and tx[-1] < -0.2, tx             # 캡컷 드래프트도 같은 방향으로 이동


def test_ai_suggests_cuts_for_dark_part_off_by_default(cf, sq_dark, tmp_path):
    with app(tmp_path, cf) as c:
        connect(c)
        jid, job, _ = upload(c, sq_dark, ai="true", features=NO_FX)
        ai = [x for x in job["result"]["cuts"] if x["kind"] == "ai"]
        assert len(ai) == 1 and ai[0]["label"] == "AI: 너무 어둡거나 밝음" and ai[0]["enabled"] is False
        assert abs(ai[0]["start"] - 8) < 0.1 and abs(ai[0]["end"] - 16) < 0.1
        full = job["result"]["out_duration"]
        r = c.post(f"/api/jobs/{jid}/rebuild", json={"toggles": {str(ai[0]["id"]): True}}).json()   # 사용자가 켜면 적용
        assert full - r["out_duration"] > 6.5 and r["counts"]["ai"] == 1
        _, auto, _ = upload(c, sq_dark, ai="true", ai_auto="true", features=NO_FX)
        assert auto["result"]["out_duration"] < full - 6.5                           # 자동 적용 옵션


def test_missing_credentials_or_api_failure_do_not_break_the_job(cf, sq, tmp_path):
    with app(tmp_path, cf) as c:
        _, job, evs = upload(c, sq, ai="true")                                      # 계정 없음
        assert job["status"] == "done" and "설정되지 않아" in job["result"]["vision"]["error"]
        assert any(e["type"] == "warning" for e in evs) and cf.requests == []
        connect(c, token="WRONG")
        _, job2, evs2 = upload(c, sq, ai="true")                                    # 토큰 오류
        assert job2["status"] == "done" and "AI 분석 실패" in job2["result"]["vision"]["error"] and "인증 실패" in job2["result"]["vision"]["error"]


def test_settings_and_connection_test_endpoints(cf, tmp_path):
    with app(tmp_path, cf) as c:
        assert c.get("/api/clef/settings").json()["configured"] is False
        assert c.post("/api/clef/test").status_code == 400
        assert c.post("/api/clef/settings", json={"account_id": ""}).status_code == 400
        connect(c)
        pub = c.get("/api/clef/settings").json()
        assert pub["configured"] and pub["token_hint"] == "…oken" and "good-token" not in str(pub)
        t = c.post("/api/clef/test").json()
        assert t["ok"] is True and t["tokens"] > 0
        connect(c, token="WRONG")
        assert c.post("/api/clef/test").status_code == 401
        assert c.delete("/api/clef/settings").json()["configured"] is False


def test_run_ai_later_from_result_screen_and_persist(cf, sq_dark, tmp_path):
    with app(tmp_path, cf) as c:
        connect(c)
        jid, job, _ = upload(c, sq_dark, workflow="shorts", features=NO_FX)       # AI 없이 먼저 완료
        assert job["result"]["vision"] is None
        est = c.get(f"/api/jobs/{jid}/vision/estimate").json()
        assert est["windows"] == 3 and est["cost_usd"] > 0 and est["configured"] and "Cloudflare" in est["sends"]
        assert c.post(f"/api/jobs/{jid}/vision", json={}).status_code == 200
        t0 = time.time()
        while c.get(f"/api/jobs/{jid}").json()["vision_state"]["state"] != "done" and time.time() - t0 < 60:
            time.sleep(0.2)
        j = c.get(f"/api/jobs/{jid}").json()
        assert j["vision_state"]["state"] == "done" and j["result"]["vision"]["reframe"]       # '완료'를 본 순간 결과에 AI 반영이 끝나 있어야 한다
        assert len([x for x in j["result"]["cuts"] if x["kind"] == "ai"]) == 1 and j["result"]["counts"]["ai"] == 0      # 제안만(꺼짐)
        cost = j["result"]["vision"]["cost_usd"]
        assert cost > 0
    with app(tmp_path, cf) as c2:                                                   # 재시작 후에도 분석 결과 유지
        j2 = c2.get(f"/api/jobs/{jid}").json()
        assert j2["result"]["vision"]["windows"] == 3
        ng = next(x for x in j2["result"]["cuts"] if x["kind"] == "ai")
        r = c2.post(f"/api/jobs/{jid}/rebuild", json={"toggles": {str(ng["id"]): True}}).json()
        assert r["vision"]["reframe"] and r["counts"]["ai"] == 1


def test_not_configured_run_is_rejected(cf, sq, tmp_path):
    with app(tmp_path, cf) as c:
        jid, _, _ = upload(c, sq)
        assert c.post(f"/api/jobs/{jid}/vision", json={}).status_code == 400


def test_vision_state_is_done_only_after_result_is_updated(cf, sq_dark, tmp_path):
    """상태가 '완료'로 보이는 모든 순간에, 읽어 간 결과에는 이미 AI 분석이 들어 있어야 한다(옛 결과를 읽던 경쟁 상태 방지)."""
    with app(tmp_path, cf) as c:
        connect(c)
        jid, _, _ = upload(c, sq_dark, features=NO_FX)
        c.post(f"/api/jobs/{jid}/vision", json={})
        seen_done, t0 = 0, time.time()
        while time.time() - t0 < 60:
            j = c.get(f"/api/jobs/{jid}").json()
            if j["vision_state"]["state"] == "done":
                assert j["result"]["vision"] is not None and j["result"]["vision"].get("windows") == 3
                seen_done += 1
                if seen_done >= 3:
                    break
            time.sleep(0.01)
        assert seen_done >= 3
