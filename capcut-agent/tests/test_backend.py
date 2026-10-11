import json
import re
import subprocess
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from capcut_agent.server import create_app
from tests.conftest import FakeBackend
from tests.test_e2e import upload, wait_done


class SlowBackend(FakeBackend):
    def __init__(self, tr, delay=1.0):
        super().__init__(tr)
        self.delay = delay

    def transcribe(self, samples, model):
        time.sleep(self.delay)
        return super().transcribe(samples, model)


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    import capcut_agent.pipeline as pl
    monkeypatch.setattr(pl, "MIN_STAGE", 0)


def make(tmp, backend):
    return TestClient(create_app(workdir=tmp / "w", backend=backend, draft_root=tmp / "d"))


def wait_status(client, jid, want, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = client.get(f"/api/jobs/{jid}").json()
        if s["status"] in want:
            return s
        time.sleep(0.1)
    raise AssertionError(f"상태 {want} 대기 시간 초과: {s['status']}")


def wait_render(client, jid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = client.get(f"/api/jobs/{jid}").json()["render"]
        if r["state"] in ("done", "error"):
            return r
        time.sleep(0.3)
    raise AssertionError("렌더 시간 초과")


# ---------- 영속화 ----------
def test_jobs_survive_restart_and_can_be_edited(tmp_path, video, transcript):
    be = FakeBackend(transcript)
    with make(tmp_path, be) as c1:
        jid = upload(c1, video)
        wait_done(c1, jid)
        before = c1.get(f"/api/jobs/{jid}").json()["result"]
    with make(tmp_path, FakeBackend(transcript)) as c2:                    # 서버 재시작
        lst = c2.get("/api/jobs").json()
        assert [j["id"] for j in lst] == [jid] and lst[0]["status"] == "done"
        after = c2.get(f"/api/jobs/{jid}").json()
        assert after["status"] == "done" and after["result"]["out_duration"] == before["out_duration"]
        assert c2.get(f"/api/jobs/{jid}/video").status_code == 200 and c2.get(f"/api/jobs/{jid}/srt").status_code == 200
        ng = next(c for c in after["result"]["cuts"] if c["kind"] == "ng")
        r = c2.post(f"/api/jobs/{jid}/rebuild", json={"toggles": {str(ng["id"]): False}}).json()   # 샘플 지연 로딩 경로
        assert r["out_duration"] > before["out_duration"] + 1.0
    with make(tmp_path, FakeBackend(transcript)) as c3:                    # 수정 내용도 영속화
        assert c3.get(f"/api/jobs/{jid}").json()["result"]["out_duration"] == r["out_duration"]


def test_render_after_restart_rebuilds_plan(tmp_path, video, transcript):
    with make(tmp_path, FakeBackend(transcript)) as c1:
        jid = upload(c1, video)
        wait_done(c1, jid)
    with make(tmp_path, FakeBackend(transcript)) as c2:
        assert c2.post(f"/api/jobs/{jid}/render").status_code == 200
        r = wait_render(c2, jid)
        assert r["state"] == "done" and Path(r["path"]).stat().st_size > 1000


def test_interrupted_job_is_marked_and_retry_uses_cache(tmp_path, video, transcript):
    be = FakeBackend(transcript)
    with make(tmp_path, be) as c1:
        jid = upload(c1, video)
        wait_done(c1, jid)
    f = tmp_path / "w" / "jobs" / jid / "job.json"
    s = json.loads(f.read_text("utf-8"))
    s["status"] = "running"                                                 # 처리 도중 서버가 죽은 상황
    s["render"]["state"] = "running"
    f.write_text(json.dumps(s), "utf-8")
    be2 = FakeBackend(transcript)
    with make(tmp_path, be2) as c2:
        j = c2.get(f"/api/jobs/{jid}").json()
        assert j["status"] == "error" and "재시작" in j["error"] and j["render"]["state"] == "error"
        assert c2.post(f"/api/jobs/{jid}/retry").status_code == 200
        wait_status(c2, jid, ("done",))
        assert be2.calls == 0                                               # ASR 캐시 재사용
        assert c2.post(f"/api/jobs/{jid}/retry").status_code == 409         # 이미 완료


def test_corrupt_job_json_does_not_block_startup(tmp_path, video, transcript):
    with make(tmp_path, FakeBackend(transcript)) as c1:
        jid = upload(c1, video)
        wait_done(c1, jid)
    (tmp_path / "w" / "jobs" / "broken").mkdir()
    (tmp_path / "w" / "jobs" / "broken" / "job.json").write_text("{not json")
    with make(tmp_path, FakeBackend(transcript)) as c2:
        assert [j["id"] for j in c2.get("/api/jobs").json()] == [jid]


# ---------- 작업 큐 ----------
def test_queue_runs_one_at_a_time_and_cancel_queued(tmp_path, video, transcript):
    be = SlowBackend(transcript, 1.5)
    with make(tmp_path, be) as c:
        a = upload(c, video)
        time.sleep(0.4)
        b = upload(c, video)
        cc = upload(c, video)
        sb = c.get(f"/api/jobs/{b}").json()
        assert sb["status"] == "queued" and sb["queue"] == 1
        assert c.get(f"/api/jobs/{cc}").json()["queue"] == 2
        assert c.post(f"/api/jobs/{b}/cancel").json()["status"] == "cancelled"
        assert c.get(f"/api/jobs/{cc}").json()["queue"] == 1               # 순번이 당겨짐
        wait_status(c, a, ("done",))
        wait_status(c, cc, ("done",))
        assert c.get(f"/api/jobs/{b}").json()["status"] == "cancelled"
        assert be.calls == 1                                                # b는 ASR을 돌리지 않았고, cc는 캐시 사용


def test_cancel_running_job(tmp_path, video, transcript):
    with make(tmp_path, SlowBackend(transcript, 1.5)) as c:
        a = upload(c, video)
        time.sleep(0.6)                                                     # ASR 진행 중
        assert c.get(f"/api/jobs/{a}").json()["status"] == "running"
        c.post(f"/api/jobs/{a}/cancel")
        s = wait_status(c, a, ("cancelled", "done"))
        assert s["status"] == "cancelled"
        evs = wait_done(c, a)
        assert evs[-1]["type"] == "cancelled"
        assert c.post(f"/api/jobs/{a}/retry").status_code == 200            # 취소한 작업은 다시 시도 가능
        evs = wait_done(c, a)                                               # 화면이 읽는 이벤트 스트림: 옛 'cancelled'가 아니라 새 'done'으로 끝나야 한다
        assert evs[-1]["type"] == "done" and not any(e["type"] == "cancelled" for e in evs)
        assert wait_status(c, a, ("done",))["status"] == "done"


# ---------- 삭제 / 정리 ----------
def test_delete_removes_everything(tmp_path, video, transcript):
    with make(tmp_path, FakeBackend(transcript)) as c:
        jid = upload(c, video, render="true")
        wait_done(c, jid)
        res = c.get(f"/api/jobs/{jid}").json()
        mp4, draft = Path(res["render"]["path"]), Path(res["result"]["draft_path"])
        assert mp4.exists() and draft.exists()
        r = c.delete(f"/api/jobs/{jid}").json()
        assert r["freed"] > 1000
        assert not mp4.exists() and not draft.exists() and not (tmp_path / "w" / "jobs" / jid).exists()
        assert c.get(f"/api/jobs/{jid}").status_code == 404


def test_cleanup_only_old_finished_jobs(tmp_path, video, transcript):
    with make(tmp_path, FakeBackend(transcript)) as c1:
        old = upload(c1, video)
        wait_done(c1, old)
        new = upload(c1, video)
        wait_done(c1, new)
    f = tmp_path / "w" / "jobs" / old / "job.json"
    s = json.loads(f.read_text("utf-8"))
    s["created"] = time.time() - 40 * 86400
    f.write_text(json.dumps(s), "utf-8")
    with make(tmp_path, FakeBackend(transcript)) as c2:
        pv = c2.get("/api/cleanup?days=30").json()
        assert pv["count"] == 1 and pv["jobs"][0]["id"] == old and pv["bytes"] > 1000
        assert c2.get("/api/cleanup?days=60").json()["count"] == 0
        assert c2.post("/api/cleanup", json={"days": 30}).json()["freed"] > 1000
        assert [j["id"] for j in c2.get("/api/jobs").json()] == [new]
        assert c2.get("/api/env").json()["usage"]["jobs"] > 0


# ---------- 편집: 단어 고치기 / 직접 컷 ----------
def test_word_edit_changes_subtitles_and_persists(tmp_path, video, transcript):
    with make(tmp_path, FakeBackend(transcript)) as c:
        jid = upload(c, video)
        wait_done(c, jid)
        seg = 1                                                             # 0번 문장은 NG로 잘려서 자막에 안 나옴 → 살아 있는 1번 문장
        wi = next(i for i, w in enumerate(transcript.segments[seg].words) if w.text == "채권관리")
        r = c.post(f"/api/jobs/{jid}/rebuild", json={"word_edits": {f"{seg}:{wi}": "채권 관리"}}).json()
        srt = c.get(f"/api/jobs/{jid}/srt").text
        assert "채권 관리" in srt and "채권관리" not in srt
        assert r["word_edits"] == {f"{seg}:{wi}": "채권 관리"}
        words = [w["text"] for s in r["transcript"]["segments"] for w in s["words"]]
        assert "채권 관리" in words
        assert r["transcript"]["segments"][seg]["words"][wi]["orig"] == "채권관리"                       # 원래 글자도 함께 전달
        r2 = c.post(f"/api/jobs/{jid}/rebuild", json={"word_edits": {f"{seg}:{wi}": ""}}).json()      # 빈 글자 = 자막에서 제외
        assert "채권" not in c.get(f"/api/jobs/{jid}/srt").text
        words2 = r2["transcript"]["segments"][seg]["words"]                                             # 지워도 번호가 밀리지 않는다
        assert len(words2) == len(transcript.segments[seg].words) and words2[wi]["text"] == "채권관리"
        r3 = c.post(f"/api/jobs/{jid}/rebuild", json={"word_edits": {f"{seg}:{wi}": None}}).json()     # 되돌리기
        assert "채권관리" in c.get(f"/api/jobs/{jid}/srt").text and r3["word_edits"] == {}


def test_deleting_words_from_transcript_makes_user_cut(tmp_path, video, transcript):
    with make(tmp_path, FakeBackend(transcript)) as c:
        jid = upload(c, video)
        wait_done(c, jid)
        r0 = c.get(f"/api/jobs/{jid}").json()["result"]
        w = transcript.segments[1].words[2]                                   # "채권관리" 4.9~5.4 구간을 지움
        r = c.post(f"/api/jobs/{jid}/rebuild", json={"add_cuts": [{"start": w.start - 0.03, "end": w.end + 0.05, "label": w.text}]}).json()
        user = [x for x in r["cuts"] if x["kind"] == "user"]
        assert len(user) == 1 and user[0]["id"] == max(x["id"] for x in r["cuts"]) and r["counts"]["user"] == 1
        assert r["out_duration"] < r0["out_duration"] - 0.4
        r2 = c.post(f"/api/jobs/{jid}/rebuild", json={"toggles": {str(user[0]["id"]): False}}).json()   # 되살리기
        assert abs(r2["out_duration"] - r0["out_duration"]) < 0.05


# ---------- 음질 보정 ----------
def lufs(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?\d+\.\d+) LUFS", out)[-1])


def test_enhance_normalizes_loudness(tmp_path, video, transcript):
    quiet = tmp_path / "quiet.mp4"                                           # 소리가 아주 작은 영상 (약 -40 LUFS)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-c:v", "copy", "-af", "volume=0.04", "-c:a", "aac", str(quiet)], check=True)
    with make(tmp_path, FakeBackend(transcript)) as c:
        vals = {}
        for name, feats in (("on", {"enhance": True}), ("off", {"enhance": False})):
            jid = upload(c, quiet, render="true", features=json.dumps(feats))
            wait_done(c, jid)
            vals[name] = lufs(c.get(f"/api/jobs/{jid}").json()["render"]["path"])
        print("LUFS", vals)
        assert vals["off"] < -26, vals                                       # 보정 없으면 너무 작다 (대조군이 실제로 작은지 확인)
        assert abs(vals["on"] + 16) < 2.5, vals                              # 보정하면 목표 -16 LUFS 근처


def test_retry_after_cancel_while_queue_is_busy(tmp_path, video, transcript):
    """다른 작업이 처리 중이라 대기해야 할 때 재시도하면, 옛 'cancelled' 이벤트가 먼저 재생돼 화면이 '취소됨'으로 끝나던 버그."""
    with make(tmp_path, SlowBackend(transcript, 2.0)) as c:
        a = upload(c, video)                                                # a가 슬롯을 차지
        time.sleep(0.4)
        b = upload(c, video)
        assert c.get(f"/api/jobs/{b}").json()["status"] == "queued"
        c.post(f"/api/jobs/{b}/cancel")
        assert c.post(f"/api/jobs/{b}/retry").status_code == 200            # a가 아직 도는 중에 재시도
        assert c.get(f"/api/jobs/{a}").json()["status"] == "running"
        evs = wait_done(c, b)                                               # 화면이 읽는 스트림
        assert evs[-1]["type"] == "done", [e["type"] for e in evs]
        assert not any(e["type"] == "cancelled" for e in evs)
