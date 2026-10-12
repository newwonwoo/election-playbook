import json
import subprocess
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from malggeum.asr import Segment, Transcript, Word
from malggeum.audio import SR
from malggeum.server import create_app
from tests.test_e2e import wait_done


def _tone(gates, dur, ch):
    g = "+".join(f"between(t\\,{a}\\,{b})" for a, b in gates)
    e = f"0.4*sin(2*PI*300*t)*({g})"
    return f"aevalsrc={e}|{e}:s=48000:d={dur}" if ch == 2 else f"aevalsrc={e}:s=48000:d={dur}"


def make_video(path, color, size, dur, gates, ch):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c={color}:s={size}:d={dur}:r=30",
                    "-f", "lavfi", "-i", _tone(gates, dur, ch), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                    "-shortest", str(path)], check=True)


@pytest.fixture(scope="module")
def vids(tmp_path_factory):
    d = tmp_path_factory.mktemp("batch")
    a, b = d / "a_part.mp4", d / "b_part.mp4"
    make_video(a, "gray", "640x360", 6, [(0.5, 2.5), (3.5, 5.5)], 2)          # 회색, 스테레오
    make_video(b, "red", "320x240", 5, [(0.5, 4.5)], 1)                       # 빨강, 모노, 해상도 다름
    return a, b


def W(s, e, t):
    return Word(s, e, t)


TR_A = Transcript("ko", [Segment(0.6, 2.4, "첫번째 영상의 인사입니다", [W(.6, 1.1, "첫번째"), W(1.2, 1.6, "영상의"), W(1.7, 2.4, "인사입니다")]),
                         Segment(3.6, 5.4, "연체 3개월을 넘기면 위험합니다", [W(3.6, 4.0, "연체"), W(4.1, 4.6, "3개월을"), W(4.7, 5.0, "넘기면"), W(5.0, 5.4, "위험합니다")])])
TR_B = Transcript("ko", [Segment(0.6, 4.4, "두번째 영상은 담보 관리를 설명합니다", [W(.6, 1.2, "두번째"), W(1.3, 1.9, "영상은"), W(2.0, 2.6, "담보"), W(2.7, 3.2, "관리를"), W(3.3, 4.4, "설명합니다")])])


class ByLength:
    """샘플 길이로 어느 영상인지 구분하는 가짜 음성 인식 (A=6초, B=5초)."""
    name = "fake"

    def __init__(self):
        self.calls = []

    def transcribe(self, samples, model):
        self.calls.append(round(len(samples) / SR))
        return TR_A if round(len(samples) / SR) == 6 else TR_B


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    import malggeum.pipeline as pl
    monkeypatch.setattr(pl, "MIN_STAGE", 0)


def make(tmp, be=None):
    return TestClient(create_app(workdir=tmp / "w", backend=be or ByLength(), draft_root=tmp / "d"))


def post(c, videos, subs=(), **form):
    form.setdefault("render", "false")
    files = [("files", (p.name, p.read_bytes(), "video/mp4")) for p in videos]
    files += [("subs", (n, body, "text/plain")) for n, body in subs]
    return c.post("/api/jobs", files=files, data=form)


def run_ok(c, videos, subs=(), **form):
    r = post(c, videos, subs, **form)
    assert r.status_code == 200, r.text
    jid = r.json()["id"]
    evs = wait_done(c, jid)
    assert evs[-1]["type"] == "done", evs[-1]
    return jid, c.get(f"/api/jobs/{jid}").json()


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
                         capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    v = next(s for s in d["streams"] if s["codec_type"] == "video")
    return int(v["width"]), int(v["height"]), float(d["format"]["duration"])


def pixel(path, t, x=0.5, y=0.5):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=20:20",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    i = (int(y * 19) * 20 + int(x * 19)) * 3
    return tuple(raw[i:i + 3])


def srt(*cues):
    return "\n".join(f"{i}\n{a} --> {b}\n{t}\n" for i, (a, b, t) in enumerate(cues, 1)).encode("utf-8")


# ---------- 이어붙이기 ----------
def test_merge_two_videos_into_one_timeline(vids, tmp_path):
    a, b = vids
    with make(tmp_path) as c:
        jid, job = run_ok(c, [a, b], features=json.dumps({"hook": False}))
        res = job["result"]
        assert abs(res["duration"] - 11.0) < 0.2
        assert [s["name"] for s in res["sources"]] == ["a_part.mp4", "b_part.mp4"] and abs(res["sources"][1]["offset"] - 6.0) < 0.1
        assert job["filename"] == "a_part.mp4 외 1개"
        segs = res["transcript"]["segments"]                                    # B의 대본은 전체 타임라인 기준으로 밀려 있다
        assert segs[0]["start"] < 3 and segs[-1]["start"] >= 6.5 and segs[-1]["text"].startswith("두번째")
        chapters = [p for p in res["points"] if p["kind"] == "chapter"]
        assert [x["label"] for x in chapters] == ["01 a_part", "02 b_part"]     # 영상 경계 = 챕터, 파일 이름이 제목
        v = c.get(f"/api/jobs/{jid}/video")                                     # 편집 프리뷰 = 이어붙인 합본
        pv = tmp_path / "pv.mp4"
        pv.write_bytes(v.content)
        assert abs(probe(pv)[2] - 11.0) < 0.3
        d = json.loads((tmp_path / "d" / res["draft_name"] / "draft_content.json").read_text("utf-8"))
        vt = next(t for t in d["tracks"] if t["type"] == "video")
        assert len({s["material_id"] for s in vt["segments"]}) == 2             # 영상 2개를 각각 참조
        assert sum(s["target_timerange"]["duration"] for s in vt["segments"]) == d["duration"]
        for x, y in zip(vt["segments"], vt["segments"][1:]):
            assert x["target_timerange"]["start"] + x["target_timerange"]["duration"] == y["target_timerange"]["start"]


def test_merged_render_shows_each_source_with_right_size_and_color(vids, tmp_path):
    a, b = vids
    with make(tmp_path) as c:
        jid, job = run_ok(c, [a, b], render="true", features=json.dumps({"hook": False, "zoom": False}))
        out = Path(job["render"]["path"])
        w, h, dur = probe(out)
        assert (w, h) == (640, 360) and abs(dur - job["result"]["out_duration"]) < 0.4
        r0, g0, b0 = pixel(out, 0.3)                                            # 처음 = A(회색)
        assert abs(r0 - g0) < 25 and abs(g0 - b0) < 25 and 80 < r0 < 180
        r1, g1, b1 = pixel(out, dur - 0.4)                                      # 끝 = B(빨강, 4:3이라 좌우 검은 띠 + 가운데 빨강)
        assert r1 > 180 and g1 < 80 and b1 < 80
        r2, g2, b2 = pixel(out, dur - 0.4, x=0.02)                              # 가장자리 = 검은 띠
        assert r2 < 40 and g2 < 40


def test_shorts_cover_every_source_to_9x16(vids, tmp_path):
    a, b = vids
    with make(tmp_path) as c:
        jid, job = run_ok(c, [a, b], render="true", workflow="shorts", features=json.dumps({"hook": False, "zoom": False}))
        out = Path(job["render"]["path"])
        w, h, dur = probe(out)
        assert (w, h) == (1080, 1920)
        r1, g1, b1 = pixel(out, dur - 0.4, x=0.05)                              # 4:3 빨강 영상도 가장자리까지 꽉 채워짐(검은 띠 없음)
        assert r1 > 180 and g1 < 80
        r0, g0, b0 = pixel(out, 0.3, x=0.05)
        assert 80 < r0 < 180 and abs(r0 - g0) < 25


# ---------- 자막 파일 ----------
def test_subtitle_file_replaces_asr(vids, tmp_path):
    a, _ = vids
    be = ByLength()
    sub = srt(("00:00:00,500", "00:00:02,500", "안녕하세요 자막 파일입니다"), ("00:00:03,500", "00:00:05,500", "연체 3개월을 넘기면 위험합니다"))
    with make(tmp_path, be) as c:
        jid, job = run_ok(c, [a], [("a_part.srt", sub)])                        # 이름이 같아서 자동으로 짝지어짐
        assert be.calls == [] and job["result"]["asr"]["source"] == "srt" and job["result"]["asr"]["backend"] == "자막 파일"
        words = [w["text"] for s in job["result"]["transcript"]["segments"] for w in s["words"]]
        assert words[:4] == ["안녕하세요", "자막", "파일입니다", "연체"]
        ws = job["result"]["transcript"]["segments"][0]["words"]
        assert 0.4 <= ws[0]["start"] and ws[-1]["end"] <= 2.6                    # 목소리 구간(0.5~2.5)에 단어 시간이 놓임
        d = json.loads((tmp_path / "d" / job["result"]["draft_name"] / "draft_content.json").read_text("utf-8"))
        texts = " ".join(m["content"] for m in d["materials"]["texts"])
        assert "안녕하세요" in texts and "자막" in texts                          # 자막 파일의 글자가 그대로 자막이 됨
        r = c.post(f"/api/jobs/{jid}/rebuild", json={"word_edits": {"0:1": "수정"}}).json()   # 단어 수정도 동작
        assert "수정" in c.get(f"/api/jobs/{jid}/srt").text


def test_mixed_one_with_sub_one_with_asr(vids, tmp_path):
    a, b = vids
    be = ByLength()
    sub = srt(("00:00:00,500", "00:00:02,500", "에이 영상 자막"))
    with make(tmp_path, be) as c:
        jid, job = run_ok(c, [a, b], [("a_part.vtt", b"WEBVTT\n\n00:00.500 --> 00:02.500\n" + "에이 영상 자막".encode() + b"\n")])
        assert be.calls == [5] and job["result"]["asr"]["source"] == "asr+srt"      # B만 음성 인식
        texts = [s["text"] for s in job["result"]["transcript"]["segments"]]
        assert texts[0] == "에이 영상 자막" and texts[-1].startswith("두번째")


def test_empty_or_bad_subtitle_gives_clear_error(vids, tmp_path):
    a, _ = vids
    with make(tmp_path) as c:
        r = post(c, [a], [("a_part.srt", b"this is not a subtitle file")])
        jid = r.json()["id"]
        evs = wait_done(c, jid)
        assert evs[-1]["type"] == "error" and "자막 파일에서 읽은 문장이 없어요" in evs[-1]["message"]
        assert post(c, [a], [("a_part.txt", b"x")]).status_code == 400


# ---------- 각각 일괄 처리 ----------
def test_separate_mode_queues_one_job_per_video(vids, tmp_path):
    a, b = vids
    be = ByLength()
    with make(tmp_path, be) as c:
        r = post(c, [a, b, a], mode="separate")
        ids = r.json()["ids"]
        assert len(ids) == 3 and len(set(ids)) == 3
        for i in ids:
            t0 = time.time()
            while c.get(f"/api/jobs/{i}").json()["status"] not in ("done", "error") and time.time() - t0 < 30:
                time.sleep(0.2)
            assert c.get(f"/api/jobs/{i}").json()["status"] == "done"
        res = [c.get(f"/api/jobs/{i}").json()["result"] for i in ids]
        assert [round(x["duration"]) for x in res] == [6, 5, 6] and all(len(x["sources"]) == 1 for x in res)
        assert len(c.get("/api/jobs").json()) == 3 and {j["videos"] for j in c.get("/api/jobs").json()} == {1}


def test_upload_limits_and_validation(vids, tmp_path, monkeypatch):
    a, b = vids
    import malggeum.server as S
    with make(tmp_path) as c:
        assert c.post("/api/jobs", data={}).status_code in (400, 422)
        assert post(c, [a], mode="zip").status_code == 400
        monkeypatch.setattr(S, "MAX_TOTAL", 10_000)                              # 전체 용량 한도 초과
        r = post(c, [a, b])
        assert r.status_code == 413
        assert c.get("/api/jobs").json() == [] and not any((tmp_path / "w" / "jobs").iterdir())      # 일부만 올라간 작업은 남지 않는다


# ---------- 재시작 후에도 ----------
def test_merged_job_survives_restart(vids, tmp_path):
    a, b = vids
    with make(tmp_path) as c1:
        jid, job = run_ok(c1, [a, b])
        before = job["result"]["out_duration"]
    with make(tmp_path) as c2:
        j = c2.get(f"/api/jobs/{jid}").json()
        assert [s["name"] for s in j["result"]["sources"]] == ["a_part.mp4", "b_part.mp4"]
        assert c2.get(f"/api/jobs/{jid}/video").status_code == 200
        ng = j["result"]["cuts"][0]
        r = c2.post(f"/api/jobs/{jid}/rebuild", json={"toggles": {str(ng["id"]): False}}).json()   # 재시작 후 합친 샘플을 다시 만들어 수정
        assert r["out_duration"] != before
        assert c2.post(f"/api/jobs/{jid}/render").status_code == 200
        t0 = time.time()
        while c2.get(f"/api/jobs/{jid}").json()["render"]["state"] not in ("done", "error") and time.time() - t0 < 60:
            time.sleep(0.3)
        rend = c2.get(f"/api/jobs/{jid}").json()["render"]
        assert rend["state"] == "done" and abs(probe(rend["path"])[2] - r["out_duration"]) < 0.5
