import subprocess
import tempfile
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from capcut_agent import points as P, refs as R, style as STY
from capcut_agent.server import create_app
from tests.fakecf import FakeCF
from tests.test_e2e import wait_done
from tests.test_vision import Backend


def _run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


@pytest.fixture(scope="module")
def vids(tmp_path_factory):
    d = tmp_path_factory.mktemp("refs")
    # 빠른 세로 레퍼: 2.5초마다 색이 바뀌는 30초 (장면 전환 11번 = 분당 22회), 소리 연속
    colors = ["red", "blue", "green", "yellow"] * 3
    ins = []
    for c in colors:
        ins += ["-f", "lavfi", "-i", f"color=c={c}:s=720x1280:d=2.5:r=24"]
    ins += ["-f", "lavfi", "-i", "sine=f=300:d=30"]
    cat = "".join(f"[{i}:v]" for i in range(12)) + "concat=n=12:v=1:a=0[v]"
    fast = d / "fast_v.mp4"
    _run(["ffmpeg", "-y", "-v", "error"] + ins + ["-filter_complex", cat, "-map", "[v]", "-map", "12:a", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                                                   "-c:a", "aac", "-shortest", str(fast)])
    # 느린 가로 레퍼: 장면 하나 30초, 말 사이에 긴 쉼 (무음 약 40%)
    gate = "+".join(f"between(t\\,{a}\\,{b})" for a, b in ((0, 5), (8, 12), (16, 20), (24, 29)))
    slow = d / "slow_h.mp4"
    _run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=1280x720:d=30:r=24", "-f", "lavfi", "-i",
          f"aevalsrc=0.4*sin(2*PI*300*t)*({gate}):s=48000:d=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(slow)])
    # 내 작업용 영상 (세로 / 가로)
    jv, jh = d / "mine_v.mp4", d / "mine_h.mp4"
    for p, size in ((jv, "720x1280"), (jh, "1280x720")):
        _run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x3c3c3c:s={size}:d=16:r=24", "-f", "lavfi", "-i", "sine=f=300:d=16",
              "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(p)])
    return {"fast": fast, "slow": slow, "mine_v": jv, "mine_h": jh}


class StyleModel:
    """가짜 Clef-omni: 스타일 질문에는 고정된 답, 'match' 질문에는 영상이 세로면 예."""

    def __call__(self, qid, q, videos, body):
        if qid == "match":
            with tempfile.TemporaryDirectory() as d:
                f = Path(d) / "c.mp4"
                f.write_bytes(videos[0])
                out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(f)],
                                     capture_output=True, text=True).stdout.strip().split(",")
            vertical = int(out[1]) > int(out[0])
            return {"type": "noul", "noul": 0.95 if vertical else 0.05}
        table = {"caps": .9, "popup": .8, "zoom": .7, "closeup": .6, "broll": .1, "emoji": .2, "slides": .1, "music": .3, "hook": .8}
        if q["type"] == "score":
            n = len(q["criteria"])
            return {"type": "score", "score": 2.0, "legend": {}, "probabilities": {str(i): 1 / n for i in range(n)}, "confidence": .5}
        return {"type": "noul", "noul": table.get(qid, .5)}


@pytest.fixture(autouse=True)
def fast_stages(monkeypatch):
    import capcut_agent.pipeline as pl
    monkeypatch.setattr(pl, "MIN_STAGE", 0)


@pytest.fixture
def cf():
    f = FakeCF(handler=StyleModel())
    yield f
    f.close()


@pytest.fixture(autouse=True)
def clean_presets():
    before = set(P.PRESETS)
    yield
    for k in set(P.PRESETS) - before:
        P.PRESETS.pop(k)


def app(tmp, cf):
    return TestClient(create_app(workdir=tmp / "w", backend=Backend(), draft_root=tmp / "d", clef_base=cf.url))


def connect(c):
    c.post("/api/clef/settings", json={"account_id": "acct123", "token": "good-token"})


def add_refs(c, paths, **form):
    r = c.post("/api/refs", files=[("files", (p.name, p.read_bytes(), "video/mp4")) for p in paths], data=form)
    assert r.status_code == 200, r.text
    ids = r.json()["ids"]
    t0 = time.time()
    while time.time() - t0 < 90:
        lst = {x["id"]: x for x in c.get("/api/refs").json()}
        if all(lst[i]["status"] in ("indexed", "error") for i in ids):
            return ids, lst
        time.sleep(0.3)
    raise AssertionError("레퍼 분석 시간 초과")


def job(c, video, **form):
    form.setdefault("render", "false")
    r = c.post("/api/jobs", files=[("files", (video.name, video.read_bytes(), "video/mp4"))], data=form)
    jid = r.json()["id"]
    assert wait_done(c, jid)[-1]["type"] == "done"
    return jid, c.get(f"/api/jobs/{jid}").json()


# ---------- 직접 측정 ----------
def test_local_metrics_cut_rate_silence_and_aspect(vids):
    fast, slow = str(vids["fast"]), str(vids["slow"])
    n = R.count_scene_cuts(fast)
    assert n == 11, n                                                              # 2.5초마다 색이 바뀜 → 정확히 11번
    assert R.count_scene_cuts(slow) == 0
    s_fast, _ = R.silence_ratio(fast)
    s_slow, v_slow = R.silence_ratio(slow)
    assert s_fast < 0.05 and 0.3 < s_slow < 0.5 and abs(s_slow + v_slow - 1) < 0.01
    assert R.aspect_of(720, 1280) == "9:16" and R.aspect_of(1280, 720) == "16:9" and R.aspect_of(1000, 1000) == "1:1"


def test_sample_windows_even_and_include_first():
    ws = R.RefStore.sample_windows(600)
    assert len(ws) == R.SAMPLES and ws[0][0] == 0 and ws == sorted(ws) and ws[-1][1] <= 600
    assert len(R.RefStore.sample_windows(30)) == 4


# ---------- 스타일 매핑 (AI 없이) ----------
def test_style_from_local_metrics_only(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        ids, lst = add_refs(c, [vids["fast"], vids["slow"]])
        f, s = lst[ids[0]], lst[ids[1]]
        assert f["status"] == "indexed" and f["clef"] is None and f["aspect"] == "9:16" and 20 < f["metrics"]["shots_per_min"] < 24
        assert s["aspect"] == "16:9" and s["metrics"]["shots_per_min"] == 0
        pf = c.post("/api/refs/style", json={"ref_ids": [ids[0]]}).json()["preset"]
        assert pf["canvas"] == "9:16" and pf["features"]["zoom"] is True and 2.5 <= pf["zoom_every"] <= 3.0      # 60/22 ≈ 2.7초마다
        assert pf["options"]["min_silence"] == 0.3 and pf["features"]["hook"] is True                            # 숏폼 기본 훅
        ps = c.post("/api/refs/style", json={"ref_ids": [ids[1]]}).json()
        assert ps["preset"]["canvas"] == "16:9" and ps["preset"]["features"]["zoom"] is False and ps["preset"]["options"]["min_silence"] >= 0.4
        assert any("컷 속도" in w for w in ps["reasons"]) and any("AI 스타일 분석이 없어" in w for w in ps["reasons"])
        assert cf.requests == []                                                                                   # AI를 안 켰으니 외부 전송 없음


def test_style_with_ai_fractions(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        connect(c)
        ids, lst = add_refs(c, [vids["fast"]], ai="true")
        r = lst[ids[0]]
        fr = r["clef"]["fractions"]
        assert r["status"] == "indexed" and r["clef"]["samples"] == 4 and len(cf.requests) == 4                    # 30초 → 구간 4개, 요청 4번
        assert fr["caps"] == 0.9 and fr["popup"] == 0.8 and abs(fr["pace"] - 2 / 3) < 0.01 and fr["hook"] == 0.8
        out = c.post("/api/refs/style", json={"ref_ids": [ids[0]]}).json()
        p = out["preset"]
        assert p["sub_size"] == 10.0 and p["sub_chars"] == 12                                                       # 큰 자막 90% → 크게
        assert p["emphasis_per_min"] == 10 and p["features"]["emphasis"] is True                                    # 팝업 80% → 분당 약 10개
        assert any("큰 자막 비율 90%" in w for w in out["reasons"]) and any("훅 켬" in w for w in out["reasons"])
        before = len(cf.requests)
        c.post(f"/api/refs/{ids[0]}/index", json={"ai": True})                                                      # 다시 분석해도 캐시 → 재과금 없음
        time.sleep(3)
        assert len(cf.requests) == before


def test_ai_index_without_account_is_rejected_and_ai_failure_keeps_local_values(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        assert c.post("/api/refs", files=[("files", ("a.mp4", vids["slow"].read_bytes(), "video/mp4"))], data={"ai": "true"}).status_code == 400
        c.post("/api/clef/settings", json={"account_id": "acct123", "token": "WRONG"})
        ids, lst = add_refs(c, [vids["slow"]], ai="true")
        r = lst[ids[0]]
        assert r["status"] == "indexed" and r["metrics"]["silence_ratio"] > 0.3 and "AI 스타일 분석 실패" in r["error"]   # 직접 측정값은 남는다


def test_bad_files_are_reported(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        assert c.post("/api/refs", files=[("files", ("a.txt", b"x", "text/plain"))]).status_code == 400            # 확장자 거절
        r = c.post("/api/refs", files=[("files", ("broken.mp4", b"this is not a video", "video/mp4"))])
        assert r.status_code == 200
        rid = r.json()["ids"][0]
        t0 = time.time()
        while time.time() - t0 < 30 and c.get("/api/refs").json()[0]["status"] not in ("error", "indexed"):
            time.sleep(0.2)
        d = c.get("/api/refs").json()[0]
        assert d["status"] == "error" and d["error"]                                                                # 손상된 영상은 이유와 함께 오류로 표시
        assert c.post("/api/refs/style", json={"ref_ids": [rid]}).status_code == 400                                # 분석 안 된 레퍼로는 스타일을 못 만든다


# ---------- 프리셋으로 저장 → 새 작업에 적용 ----------
def test_save_preset_from_ref_apply_persist_delete(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        ids, _ = add_refs(c, [vids["fast"]])
        r = c.post("/api/presets/from-refs", json={"ref_ids": ids, "name": "빠른 숏폼"}).json()
        pid = r["id"]
        assert pid.startswith("ref_") and r["preset"]["label"] == "레퍼 · 빠른 숏폼"
        lst = c.get("/api/presets").json()
        assert lst[pid]["custom"] is True and lst["shorts"]["custom"] is False
        jid, j = job(c, vids["mine_h"], workflow=pid)                                                             # 가로 영상에 세로 스타일 적용
        assert j["result"]["canvas"] == [1080, 1920] and j["result"]["workflow"] == pid
    with app(tmp_path, cf) as c2:                                                                                   # 재시작 후에도 프리셋 유지
        assert pid in c2.get("/api/presets").json()
        assert c2.delete("/api/presets/shorts").status_code == 404                                                  # 기본 프리셋은 못 지움
        assert c2.delete(f"/api/presets/{pid}").status_code == 200 and pid not in c2.get("/api/presets").json()
        assert c2.post("/api/presets/from-refs", json={"ref_ids": ["nope"], "name": "x"}).status_code == 404


def test_restyle_existing_job_with_custom_preset(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        ids, _ = add_refs(c, [vids["fast"]])
        pid = c.post("/api/presets/from-refs", json={"ref_ids": ids, "name": "s"}).json()["id"]
        jid, j = job(c, vids["mine_h"], workflow="longform")
        assert j["result"]["canvas"] == [1280, 720]
        r = c.post(f"/api/jobs/{jid}/restyle", json={"workflow": pid}).json()
        assert r["canvas"] == [1080, 1920] and r["workflow"] == pid
        assert c.post(f"/api/jobs/{jid}/restyle", json={"workflow": "nope"}).status_code == 400


# ---------- 레퍼 찾기 ----------
def test_similar_refs_ranked_by_format(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        ids, _ = add_refs(c, [vids["fast"], vids["slow"]])
        name = {ids[0]: "fast_v.mp4", ids[1]: "slow_h.mp4"}
        jv, _ = job(c, vids["mine_v"])
        jh, _ = job(c, vids["mine_h"])
        rv = c.get(f"/api/jobs/{jv}/refs/similar").json()["results"]
        rh = c.get(f"/api/jobs/{jh}/refs/similar").json()["results"]
        assert name[rv[0]["id"]] == "fast_v.mp4" and any("화면 비율 같음" in x for x in rv[0]["reasons"]) and rv[0]["score"] > rv[1]["score"]
        assert name[rh[0]["id"]] == "slow_h.mp4"


def test_free_text_search_over_library(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        ids, _ = add_refs(c, [vids["fast"], vids["slow"]])
        assert c.post("/api/refs/search", json={"query": "vertical video"}).status_code == 400                      # 계정 없음
        connect(c)
        assert c.post("/api/refs/search", json={"query": "  "}).status_code == 400
        out = c.post("/api/refs/search", json={"query": "a vertical phone video"}).json()
        top = out["results"][0]
        assert top["name"] == "fast_v.mp4" and top["score"] > 0.9 and out["results"][1]["score"] < 0.1 and out["cost_usd"] > 0
        q = cf.requests[-1]["body"]["questions"]["match"]["instructions"]
        assert "a vertical phone video" in q                                                                          # 사용자의 질문이 그대로 전달됨


def test_delete_ref_removes_files(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        ids, _ = add_refs(c, [vids["slow"]])
        d = tmp_path / "w" / "refs" / ids[0]
        assert d.exists()
        assert c.delete(f"/api/refs/{ids[0]}").status_code == 200 and not d.exists() and c.delete(f"/api/refs/{ids[0]}").status_code == 404


# ---------- 옵션: 레퍼런스에 맞춰 편집 ----------
def test_job_follows_reference_style_option(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        (rid,), _ = add_refs(c, [vids["fast"]])                                    # 빠른 세로 레퍼
        base_id, base = job(c, vids["mine_h"])                                     # 옵션 없이: 가로 롱폼
        assert base["result"]["canvas"] == [1280, 720] and base["refs"] == []
        assert c.get(f"/api/jobs/{base_id}/refs/match").status_code == 404         # 레퍼 없는 작업엔 비교 없음
        jid, j = job(c, vids["mine_h"], ref_ids=rid)                               # 같은 영상 + 레퍼 선택
        assert j["refs"] == [rid] and j["ref_why"]
        assert j["result"]["canvas"] == [1080, 1920]                               # 레퍼가 세로 → 세로 캔버스로 맞춤
        assert j["result"]["point_counts"]["zoom"] > 0                             # 분당 22컷 레퍼 → 줌 켜짐
        assert not any(k.startswith("refjob_") for k in c.get("/api/presets").json())   # 내 스타일 목록엔 안 나옴
        m = c.get(f"/api/jobs/{jid}/refs/match").json()
        assert [r["label"] for r in m["rows"]][:2] == ["컷 속도(분당)", "영상 길이(분)"] and m["names"] == ["fast_v.mp4"]
        assert all({"ref", "mine", "close"} <= set(r) for r in m["rows"])


def test_ref_option_validation(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        up = [("files", ("a.mp4", vids["mine_v"].read_bytes(), "video/mp4"))]
        assert c.post("/api/jobs", files=up, data={"ref_ids": "nope"}).status_code == 404
        assert c.get("/api/jobs").json() == []                                     # 거절된 요청은 작업을 남기지 않음


def test_rename_ref_and_only_one_ref_per_job(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        (a, b), _ = add_refs(c, [vids["fast"], vids["slow"]])
        assert c.patch(f"/api/refs/{a}", json={"name": "빠른 숏츠 스타일"}).json()["name"] == "빠른 숏츠 스타일"
        assert {r["id"]: r["name"] for r in c.get("/api/refs").json()}[a] == "빠른 숏츠 스타일"
        assert c.patch(f"/api/refs/{a}", json={"name": "  "}).status_code == 400
        assert c.patch("/api/refs/nope", json={"name": "x"}).status_code == 404
        up = [("files", ("a.mp4", vids["mine_v"].read_bytes(), "video/mp4"))]
        assert c.post("/api/jobs", files=up, data={"ref_ids": f"{a},{b}"}).status_code == 400      # 평균 내지 않고 하나만 고른다
        assert c.get("/api/jobs").json() == []
        jid, j = job(c, vids["mine_v"], ref_ids=b)                                                  # 느린 레퍼 하나 → 그 스타일
        assert j["refs"] == [b] and c.get(f"/api/jobs/{jid}/refs/match").json()["names"] == ["slow_h.mp4"]


def test_ref_job_survives_restart_and_deleted_ref(vids, cf, tmp_path):
    with app(tmp_path, cf) as c:
        (rid,), _ = add_refs(c, [vids["fast"]])
        jid, _ = job(c, vids["mine_h"], ref_ids=rid)
    with app(tmp_path, cf) as c2:                                                  # 재시작: 자동 프리셋이 복원돼 다시 만들기가 된다
        j = c2.get(f"/api/jobs/{jid}").json()
        assert j["refs"] == [rid]
        assert c2.post(f"/api/jobs/{jid}/rebuild", json={}).status_code == 200
        assert c2.delete(f"/api/refs/{rid}").status_code == 200
        assert c2.get(f"/api/jobs/{jid}/refs/match").status_code == 410            # 레퍼가 지워져도 작업은 그대로
        assert c2.get(f"/api/jobs/{jid}").json()["status"] == "done"
