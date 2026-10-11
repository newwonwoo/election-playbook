"""작업(Job) 모델 + 파이프라인 + 영속화 + 작업 큐. 각 단계는 SSE 이벤트로 노출."""
from __future__ import annotations

import asyncio
import json
import shutil
import os
import threading
import time
import uuid
import shutil as _sh
from dataclasses import dataclass, asdict, field
from pathlib import Path

from . import audio, cuts as C, draft, filler, plan as PL, points as P, render as RD, subtitles
from .asr import AsrService, Segment, Transcript, Word

STAGES = [("silence", "무음 감지"), ("asr", "음성 인식"), ("filler", "잔말·NG 판정"), ("points", "편집 포인트 탐색"), ("draft", "드래프트 생성"), ("render", "영상 렌더링")]
TERMINAL = ("done", "error", "cancelled")


class JobCancelled(Exception):
    pass
MIN_STAGE = float(os.environ.get("CAPCUT_MIN_STAGE", "0.4"))   # 캐시 hit여도 단계가 눈에 보이도록


@dataclass
class Options:
    model: str = "small"
    threshold_db: float | None = None      # None = 적응형
    min_silence: float | None = None       # None = 워크플로 프리셋 값
    pad: float | None = None               # 컷 경계에 남기는 숨쉬기 여유
    aggressive: bool | None = None
    subtitles: bool = True
    workflow: str = "longform"             # shorts | longform | lecture
    features: dict | None = None           # 편집 포인트별 on/off 덮어쓰기 (None = 프리셋)
    glossary: str = ""                     # "틀린표기=맞는표기" / "강조어" 줄 단위
    render: bool = True                    # 완성 mp4까지 자동 렌더 (캡컷 불필요)

    def resolved(self) -> "Options":
        pr = P.PRESETS[self.workflow]["options"]
        return Options(**{**asdict(self), "min_silence": self.min_silence if self.min_silence is not None else pr["min_silence"],
                          "pad": self.pad if self.pad is not None else pr["pad"],
                          "aggressive": self.aggressive if self.aggressive is not None else pr["aggressive"]})


@dataclass
class Job:
    id: str
    dir: Path
    filename: str
    source: Path
    options: Options
    status: str = "queued"                 # queued|running|done|error
    events: list[dict] = field(default_factory=list)
    result: dict | None = None
    error: str | None = None
    # 재빌드에 필요한 중간 데이터
    info: dict = field(default_factory=dict)
    cuts: list[C.Cut] = field(default_factory=list)
    keep_marks: list[tuple[float, float]] = field(default_factory=list)
    transcript: Transcript | None = None
    samples: object = None                 # 16kHz mono PCM (재빌드 시 음량/강조 분석에 재사용)
    point_off: set[str] = field(default_factory=set)
    plan: object = None
    out_dir: Path | None = None
    render: dict = field(default_factory=lambda: {"state": "idle", "pct": 0.0, "path": None, "size": 0, "error": None})
    render_gen: int = 0
    render_cancel: object = None
    files: dict = field(default_factory=dict)     # 다운로드 허용 파일 (이름 → 경로)
    created: float = field(default_factory=time.time)
    cancel_flag: threading.Event = field(default_factory=threading.Event)
    word_edits: dict = field(default_factory=dict)   # "세그먼트:단어" → 고친 글자 ("" = 자막/팝업에서 제외)
    queue_pos: int = 0

    def emit(self, type_: str, **data) -> None:
        self.events.append({"i": len(self.events), "t": round(time.time(), 2), "type": type_, **data})

    def public(self) -> dict:
        return {"id": self.id, "filename": self.filename, "status": self.status, "created": self.created,
                "queue": self.queue_pos, "error": self.error, "result": self.result, "render": self.render,
                "stages": [{"key": k, "label": l} for k, l in STAGES]}

    def summary(self) -> dict:
        r = self.result or {}
        return {"id": self.id, "filename": self.filename, "status": self.status, "created": self.created,
                "workflow": self.options.workflow, "out_duration": r.get("out_duration"), "render": self.render.get("state"),
                "render_size": self.render.get("size", 0), "queue": self.queue_pos, "error": self.error}

    # ---- 영속화 (임시파일 → 교체로 중간에 꺼져도 깨지지 않게) ----
    def save(self) -> None:
        try:
            state = {"id": self.id, "filename": self.filename, "source": self.source.name, "options": asdict(self.options),
                     "status": self.status, "error": self.error, "info": self.info, "created": self.created,
                     "cuts": [asdict(c) for c in self.cuts], "keep_marks": [list(k) for k in self.keep_marks],
                     "point_off": sorted(self.point_off), "word_edits": self.word_edits, "result": self.result,
                     "transcript": self.transcript.to_dict() if self.transcript else None,
                     "render": self.render, "files": {k: str(v) for k, v in self.files.items()}}
            tmp = self.dir / "job.json.tmp"
            tmp.write_text(json.dumps(state, ensure_ascii=False), "utf-8")
            os.replace(tmp, self.dir / "job.json")
        except Exception:  # noqa: BLE001 - 저장 실패가 작업을 죽이면 안 된다
            pass


class Scheduler:
    """분석 작업은 CAPCUT_JOBS건(기본 1)씩, 렌더는 1건씩. 나머지는 순번대로 대기."""

    def __init__(self, jobs: int | None = None, renders: int = 1) -> None:
        self.pipe = asyncio.Semaphore(jobs or int(os.environ.get("CAPCUT_JOBS", "1")))
        self.render = asyncio.Semaphore(renders)
        self.waiting: list[Job] = []

    def renumber(self) -> None:
        for i, j in enumerate(self.waiting, 1):
            if j.queue_pos != i:
                j.queue_pos = i
                j.emit("queue", pos=i)


class JobStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.jobs: dict[str, Job] = {}
        self.sched: Scheduler | None = None

    def create(self, filename: str, options: Options) -> Job:
        jid = uuid.uuid4().hex[:10]
        d = self.root / "jobs" / jid
        d.mkdir(parents=True)
        ext = Path(filename).suffix.lower()
        job = Job(jid, d, filename, d / f"source{ext}", options)
        job.out_dir = self.root / "output"
        self.jobs[jid] = job
        return job

    def load_all(self) -> int:
        """서버 시작 시 디스크의 작업을 복원. 처리 중이던 작업은 '중단됨'으로 표시(다시 시도 가능)."""
        n = 0
        for f in sorted((self.root / "jobs").glob("*/job.json")):
            try:
                s = json.loads(f.read_text("utf-8"))
                d = f.parent
                opts = Options(**s["options"])
                job = Job(s["id"], d, s["filename"], d / s["source"], opts)
                job.out_dir = self.root / "output"
                job.status, job.error, job.info, job.created = s["status"], s.get("error"), s.get("info") or {}, s.get("created", 0)
                job.cuts = [C.Cut(**c) for c in s.get("cuts", [])]
                job.keep_marks = [tuple(k) for k in s.get("keep_marks", [])]
                job.point_off, job.word_edits = set(s.get("point_off", [])), s.get("word_edits", {})
                job.result = s.get("result")
                job.transcript = Transcript.from_dict(s["transcript"]) if s.get("transcript") else None
                job.render = s.get("render") or job.render
                job.files = {k: Path(v) for k, v in (s.get("files") or {}).items()}
                if job.status in ("queued", "running"):
                    job.status, job.error = "error", "서버가 재시작되어 처리가 중단됐어요. '다시 시도'를 누르면 이어서 처리해요 (음성 인식은 캐시를 써서 빨라요)."
                if job.render.get("state") in ("running", "queued"):
                    job.render.update(state="error", error="서버가 재시작되어 렌더링이 중단됐어요. '다시 렌더링'을 눌러 주세요.")
                job.emit("done" if job.status == "done" else job.status if job.status in ("cancelled",) else "error",
                         **({"message": job.error} if job.status == "error" else {}))
                self.jobs[job.id] = job
                n += 1
            except Exception:  # noqa: BLE001 - 깨진 작업 하나가 서버 시작을 막으면 안 된다
                continue
        return n

    def list(self, limit: int = 30) -> list[dict]:
        return [j.summary() for j in sorted(self.jobs.values(), key=lambda j: -j.created)[:limit]]

    # ---- 삭제 / 정리 ----
    def artifacts(self, job: Job) -> list[Path]:
        """작업이 만든 모든 산출물: 작업 폴더, 완성 mp4(+숏츠), 캡컷 드래프트."""
        paths = [job.dir]
        paths += [Path(v) for v in job.files.values()]
        if job.result and job.result.get("draft_path"):
            paths.append(Path(job.result["draft_path"]))
        return [p for p in dict.fromkeys(paths) if p.exists()]

    @staticmethod
    def size_of(path: Path) -> int:
        if path.is_file():
            return path.stat().st_size
        return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())

    def delete(self, job: Job) -> int:
        job.cancel_flag.set()
        if job.render_cancel is not None:
            job.render_cancel.set()
        freed = 0
        for p in self.artifacts(job):
            freed += self.size_of(p)
            _sh.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
        self.jobs.pop(job.id, None)
        return freed

    def stale(self, days: float, now: float | None = None) -> list[Job]:
        now = now or time.time()
        return [j for j in self.jobs.values() if j.status in TERMINAL and now - j.created > days * 86400
                and j.render.get("state") not in ("running", "queued")]

    def usage(self) -> dict:
        def sz(p: Path) -> int:
            return self.size_of(p) if p.exists() else 0
        return {"jobs": sz(self.root / "jobs"), "output": sz(self.root / "output"), "asr_cache": sz(self.root / "asr_cache")}


def apply_word_edits(tr: Transcript, edits: dict) -> Transcript:
    """사용자가 고친 단어를 대본에 반영한 복사본 (자막·팝업·훅 판정에 쓰인다). 빈 글자 = 해당 단어 제외."""
    if not edits:
        return tr
    segs = []
    for si, s in enumerate(tr.segments):
        touched = any(f"{si}:{wi}" in edits for wi in range(len(s.words)))
        ws = []
        for wi, w in enumerate(s.words):
            t = edits.get(f"{si}:{wi}")
            if t is None:
                ws.append(w)
            elif t.strip():
                ws.append(Word(w.start, w.end, t.strip()))
        segs.append(Segment(s.start, s.end, " ".join(w.text for w in ws) if touched else s.text, ws))
    return Transcript(tr.language, segs)


def overlay_dict(tr: Transcript, edits: dict) -> dict:
    """UI로 보내는 대본: 단어 번호(세그먼트:단어)를 그대로 유지한다. 고친 단어는 새 글자 + orig(원래 글자),
    지운 단어("")는 원래 글자를 그대로 두고 word_edits로만 표시 → 번호가 밀리지 않아 다시 고칠 수 있다."""
    d = tr.to_dict()
    for key, v in edits.items():
        si, wi = (int(x) for x in key.split(":"))
        try:
            w = d["segments"][si]["words"][wi]
        except IndexError:
            continue
        w["orig"] = w["text"]
        if v.strip():
            w["text"] = v.strip()
    return d


def edited(job: Job) -> Transcript:
    return apply_word_edits(job.transcript, job.word_edits)


async def _stage(job: Job, key: str, fn):
    """단계 실행 + 이벤트. 최소 MIN_STAGE초 표시."""
    if job.cancel_flag.is_set():
        raise JobCancelled()
    t0 = time.perf_counter()
    job.emit("stage", key=key, state="running")
    out = await fn()
    rest = MIN_STAGE - (time.perf_counter() - t0)
    if rest > 0:
        await asyncio.sleep(rest)
    job.emit("stage", key=key, state="done", sec=round(time.perf_counter() - t0, 2))
    job.save()
    return out


def _silence_cuts(speech, duration, o: Options) -> list[tuple[str, float, float, str]]:
    out, prev = [], 0.0
    bounds = speech + [(duration, duration)]
    for i, (s, e) in enumerate(bounds):
        a = prev + (o.pad if i > 0 else 0.0)
        b = s - (o.pad if i < len(speech) else 0.0)
        if b - a >= 0.15:
            out.append(("silence", a, b, f"무음 {b - a:.1f}s"))
        prev = e
    return out


def make_plan(job: Job, keep: list[C.Interval] | None = None, workflow: str | None = None,
              features: dict | None = None) -> PL.Plan:
    keep = keep if keep is not None else C.compute_keep(job.info["duration"], job.cuts, job.keep_marks)
    if not keep:
        raise ValueError("남는 구간이 없어요. 말이 감지되지 않았거나 컷이 전부 활성화돼 있습니다 (무음 기준 dB를 낮춰보세요)")
    o = job.options
    if job.samples is None:                                  # 서버 재시작 후 첫 수정 때 한 번만 다시 읽는다
        job.samples = audio.load_pcm(str(job.source))
    return PL.build(edited(job), job.samples, keep, job.info, workflow=workflow or o.workflow,
                    features=features if features is not None else o.features, off=job.point_off, glossary=o.glossary)


def write_draft(job: Job, plan: PL.Plan, draft_root: Path) -> dict:
    """현재 cuts/keep_marks/plan 기준 드래프트 + 결과 dict. ASR 재실행 없음."""
    job.plan = plan
    dur = job.info["duration"]
    keep = C.compute_keep(dur, job.cuts, job.keep_marks)
    name = draft.safe_name(Path(job.filename).stem) + "_" + job.id[:4]
    path = draft.build(str(job.source), job.info, plan, draft_root, name, job.options.subtitles)
    (job.dir / "subtitles.srt").write_text(subtitles.to_srt(plan.subs), "utf-8")
    main_len = C.total(keep)
    counts = {k: sum(1 for c in job.cuts if c.kind == k and c.enabled) for k in ("silence", "filler", "ng", "user")}
    pcounts = {k: sum(1 for p in plan.points if p.kind == k and p.enabled) for k in P.KINDS if k != "highlight"}
    et = edited(job)
    hl = P.detect_highlights(et, job.samples, keep) if job.options.workflow != "shorts" else []
    prev = job.result or {}
    return {
        "duration": round(dur, 3), "out_duration": round(plan.out_duration, 3), "saved": round(dur - main_len, 3),
        "saved_pct": round((dur - main_len) / dur * 100, 1) if dur else 0, "teaser_len": round(plan.teaser_len, 3),
        "keep": [[round(s, 3), round(e, 3)] for s, e in keep],
        "cuts": [c.to_dict() for c in job.cuts], "keep_marks": [list(k) for k in job.keep_marks],
        "counts": counts, "point_counts": pcounts, "subtitle_count": len(plan.subs),
        "points": [p.to_dict() for p in plan.points], "highlights": [h.to_dict() for h in hl],
        "preview": plan.preview, "chapters_text": plan.chapters_text,
        "workflow": job.options.workflow, "canvas": list(plan.canvas),
        "draft_path": str(path), "draft_name": name, "info": job.info, "transcript": overlay_dict(job.transcript, job.word_edits),
        "word_edits": job.word_edits,
        "peaks": prev.get("peaks", []), "threshold_db": prev.get("threshold_db"), "asr": prev.get("asr", {}),
    }


def build_clip(job: Job, draft_root: Path, start: float, end: float) -> dict:
    """숏츠 후보 구간 → 별도 9:16 숏폼 드래프트(훅/챕터 없이)."""
    keep = C.compute_keep(job.info["duration"], job.cuts, job.keep_marks)
    win = [(max(s, start), min(e, end)) for s, e in keep if e > start and s < end]
    plan = make_plan(job, [w for w in win if w[1] - w[0] > 0.1], "shorts", {"hook": False, "chapters": False})
    name = f"{draft.safe_name(Path(job.filename).stem)}_short_{int(start)}"
    path = draft.build(str(job.source), job.info, plan, draft_root, name, job.options.subtitles)
    res = {"draft_path": str(path), "draft_name": name, "out_duration": round(plan.out_duration, 2),
           "subtitle_count": len(plan.subs), "canvas": list(plan.canvas)}
    if job.options.render:                                  # 숏츠도 mp4까지 완전 자동
        out = job.out_dir / f"{name}.mp4"
        RD.render(str(job.source), job.info, plan, out, job.dir / f"work_{name}", on_progress=lambda f: None,
                  with_subs=job.options.subtitles)
        shutil.rmtree(job.dir / f"work_{name}", ignore_errors=True)
        job.files[out.name] = out
        res.update(video_path=str(out), video_name=out.name, video_size=out.stat().st_size)
    return res


def do_render(job: Job) -> None:
    """현재 plan으로 완성 mp4 렌더 (스레드에서 실행). 새 렌더가 시작되면 이전 렌더는 취소된다."""
    if job.render_cancel is not None:
        job.render_cancel.set()                              # 진행 중이던 이전 렌더 중단
    cancel = threading.Event()
    job.render_cancel = cancel
    job.render_gen += 1
    gen = job.render_gen
    job.render.update(state="running", pct=0.0, error=None)
    if job.plan is None:                                     # 서버 재시작 후: 저장된 컷/수정으로 계획을 다시 만든다
        job.plan = make_plan(job)
    plan, name = job.plan, job.result["draft_name"]
    out = job.out_dir / f"{name}.mp4"
    last = [-1]

    def prog(f: float) -> None:
        if gen != job.render_gen:
            return
        job.render["pct"] = round(f * 100, 1)
        if int(f * 100) != last[0]:
            last[0] = int(f * 100)
            job.emit("progress", key="render", pct=last[0])
    try:
        RD.render(str(job.source), job.info, plan, out, job.dir / "work", on_progress=prog, cancel=cancel,
                  with_subs=job.options.subtitles)
        if gen == job.render_gen:
            job.files["main"] = out
            job.render.update(state="done", pct=100.0, path=str(out), size=out.stat().st_size, name=out.name)
    except RD.RenderCancelled:
        pass                                                  # 더 새로운 렌더가 이어받음
    except Exception as e:  # noqa: BLE001
        if gen == job.render_gen:
            job.render.update(state="error", error=f"{type(e).__name__}: {e}")
    finally:
        if gen == job.render_gen:
            shutil.rmtree(job.dir / "work", ignore_errors=True)
            job.save()


async def render_slot(job: Job, sched: Scheduler | None) -> None:
    """렌더는 한 번에 1건. 대기 중이면 상태를 'queued'로 보여준다."""
    if sched is None:
        return await asyncio.to_thread(do_render, job)
    job.render.update(state="queued", pct=0.0, error=None)
    async with sched.render:
        if job.cancel_flag.is_set():
            job.render.update(state="idle")
            return
        await asyncio.to_thread(do_render, job)


async def render_bg(job: Job, sched: Scheduler | None = None) -> None:
    job.render.update(state="running", pct=0.0, error=None)  # 호출 즉시 UI가 '렌더링 중'을 보도록
    await render_slot(job, sched)


async def run(job: Job, asr: AsrService, draft_root: Path, sched: Scheduler | None = None) -> None:
    o = job.options.resolved()
    job.options = o
    job.status, job.error = "running", None
    job.events.clear()
    job.save()
    try:
        job.info = await asyncio.to_thread(audio.probe, str(job.source))
        meta: dict = {}

        async def s_silence():
            samples = await asyncio.to_thread(audio.load_pcm, str(job.source))
            speech, thr = audio.detect_speech(samples, threshold_db=o.threshold_db, min_silence=o.min_silence)
            job.samples = samples
            meta.update(speech=speech, thr=thr, peaks=audio.waveform_peaks(samples))
        await _stage(job, "silence", s_silence)

        async def s_asr():
            job.transcript, cached = await asr.transcribe(str(job.source), job.samples, o.model)
            meta["cached"] = cached
        await _stage(job, "asr", s_asr)

        async def s_filler():
            found = _silence_cuts(meta["speech"], job.info["duration"], o)
            found += filler.detect(job.transcript, aggressive=o.aggressive)
            job.cuts = [C.Cut(i, k, s, e, l) for i, (k, s, e, l) in enumerate(found)]
        await _stage(job, "filler", s_filler)

        async def s_points():
            meta["plan"] = await asyncio.to_thread(make_plan, job)
        await _stage(job, "points", s_points)

        async def s_draft():
            job.result = {"peaks": meta["peaks"], "threshold_db": round(meta["thr"], 1),
                          "asr": {"backend": asr.backend.name, "model": o.model, "cached": meta["cached"]}}
            job.result = await asyncio.to_thread(write_draft, job, meta["plan"], draft_root)
        await _stage(job, "draft", s_draft)

        async def s_render():
            if not o.render:
                job.render["state"] = "skipped"
                return
            await render_slot(job, sched)
            if job.render["state"] == "error":
                job.emit("render_error", message=job.render["error"])
        await _stage(job, "render", s_render)
        job.status = "done"
        job.emit("done")
    except JobCancelled:
        job.status = "cancelled"
        job.emit("cancelled")
    except Exception as e:  # noqa: BLE001 - 사용자에게 원인을 그대로 보여준다
        job.status, job.error = "error", f"{type(e).__name__}: {e}"
        job.emit("error", message=job.error)
    finally:
        job.save()


async def run_queued(job: Job, asr: AsrService, draft_root: Path, sched: Scheduler) -> None:
    """큐에 넣고 순번이 오면 실행. 대기 중 취소하면 실행하지 않는다."""
    job.status, job.error = "queued", None
    job.events.clear()
    job.cancel_flag.clear()
    sched.waiting.append(job)
    sched.renumber()
    job.save()
    try:
        async with sched.pipe:
            if job in sched.waiting:
                sched.waiting.remove(job)
            job.queue_pos = 0
            sched.renumber()
            if job.cancel_flag.is_set():
                job.status = "cancelled"
                job.emit("cancelled")
                job.save()
                return
            await run(job, asr, draft_root, sched)
    finally:
        if job in sched.waiting:
            sched.waiting.remove(job)
            sched.renumber()


def cancel(job: Job, sched: Scheduler | None) -> str:
    """대기 중이면 즉시, 진행 중이면 다음 단계 경계/렌더 중단. (음성 인식 한 번은 중간에 못 멈춘다)"""
    if job.status in TERMINAL:
        return job.status
    job.cancel_flag.set()
    if job.render_cancel is not None:
        job.render_cancel.set()
    if job.status == "queued":
        if sched and job in sched.waiting:
            sched.waiting.remove(job)
            sched.renumber()
        job.status, job.queue_pos = "cancelled", 0
        job.emit("cancelled")
        job.save()
    return "cancelled"


async def rebuild(job: Job, draft_root: Path, toggles: dict[int, bool], keep_marks: list[tuple[float, float]],
                  point_toggles: dict[str, bool] | None = None, add_cuts: list[dict] | None = None,
                  word_edits: dict[str, str | None] | None = None, sched: Scheduler | None = None) -> dict:
    nid = max((c.id for c in job.cuts), default=-1) + 1
    for ac in add_cuts or []:                                # 대본에서 지운 단어 → '직접' 컷
        s, e = float(ac["start"]), float(ac["end"])
        if e > s:
            job.cuts.append(C.Cut(nid, "user", max(0.0, s), min(job.info["duration"], e), str(ac.get("label", ""))[:30]))
            nid += 1
    for k, v in (word_edits or {}).items():                  # None = 수정 취소
        if v is None:
            job.word_edits.pop(k, None)
        else:
            job.word_edits[k] = v
    for c in job.cuts:
        if c.id in toggles:
            c.enabled = toggles[c.id]
    job.keep_marks = [(float(s), float(e)) for s, e in keep_marks if e > s]
    for k, on in (point_toggles or {}).items():
        (job.point_off.discard if on else job.point_off.add)(k)
    plan = await asyncio.to_thread(make_plan, job)
    job.result = await asyncio.to_thread(write_draft, job, plan, draft_root)
    job.emit("rebuilt")
    job.save()
    if job.options.render:
        job.render.update(state="running", pct=0.0, error=None)
        asyncio.create_task(render_bg(job, sched))           # 수정할 때마다 완성본 자동 재렌더
    return job.result
