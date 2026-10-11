"""작업(Job) 모델 + 파이프라인: silence → asr → filler → draft. 각 단계는 SSE 이벤트로 노출."""
from __future__ import annotations

import asyncio
import json
import shutil
import os
import threading
import time
import uuid
from dataclasses import dataclass, asdict, field
from pathlib import Path

from . import audio, cuts as C, draft, filler, plan as PL, points as P, render as RD, subtitles
from .asr import AsrService, Transcript

STAGES = [("silence", "무음 감지"), ("asr", "음성 인식"), ("filler", "잔말·NG 판정"), ("points", "편집 포인트 탐색"), ("draft", "드래프트 생성"), ("render", "영상 렌더링")]
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

    def emit(self, type_: str, **data) -> None:
        self.events.append({"i": len(self.events), "t": round(time.time(), 2), "type": type_, **data})

    def public(self) -> dict:
        return {"id": self.id, "filename": self.filename, "status": self.status,
                "error": self.error, "result": self.result, "render": self.render, "stages": [{"key": k, "label": l} for k, l in STAGES]}


class JobStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.jobs: dict[str, Job] = {}

    def create(self, filename: str, options: Options) -> Job:
        jid = uuid.uuid4().hex[:10]
        d = self.root / "jobs" / jid
        d.mkdir(parents=True)
        ext = Path(filename).suffix.lower()
        job = Job(jid, d, filename, d / f"source{ext}", options)
        job.out_dir = self.root / "output"
        self.jobs[jid] = job
        return job


async def _stage(job: Job, key: str, fn):
    """단계 실행 + 이벤트. 최소 MIN_STAGE초 표시."""
    t0 = time.perf_counter()
    job.emit("stage", key=key, state="running")
    out = await fn()
    rest = MIN_STAGE - (time.perf_counter() - t0)
    if rest > 0:
        await asyncio.sleep(rest)
    job.emit("stage", key=key, state="done", sec=round(time.perf_counter() - t0, 2))
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
    return PL.build(job.transcript, job.samples, keep, job.info, workflow=workflow or o.workflow,
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
    counts = {k: sum(1 for c in job.cuts if c.kind == k and c.enabled) for k in ("silence", "filler", "ng")}
    pcounts = {k: sum(1 for p in plan.points if p.kind == k and p.enabled) for k in P.KINDS if k != "highlight"}
    hl = P.detect_highlights(job.transcript, job.samples, keep) if job.options.workflow != "shorts" else []
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
        "draft_path": str(path), "draft_name": name, "info": job.info, "transcript": job.transcript.to_dict(),
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


async def render_bg(job: Job) -> None:
    job.render.update(state="running", pct=0.0, error=None)  # 호출 즉시 UI가 '렌더링 중'을 보도록
    await asyncio.to_thread(do_render, job)


async def run(job: Job, asr: AsrService, draft_root: Path) -> None:
    o = job.options.resolved()
    job.options = o
    job.status = "running"
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
            await asyncio.to_thread(do_render, job)
            if job.render["state"] == "error":
                job.emit("render_error", message=job.render["error"])
        await _stage(job, "render", s_render)
        job.status = "done"
        job.emit("done")
    except Exception as e:  # noqa: BLE001 - 사용자에게 원인을 그대로 보여준다
        job.status, job.error = "error", f"{type(e).__name__}: {e}"
        job.emit("error", message=job.error)


async def rebuild(job: Job, draft_root: Path, toggles: dict[int, bool], keep_marks: list[tuple[float, float]],
                  point_toggles: dict[str, bool] | None = None) -> dict:
    for c in job.cuts:
        if c.id in toggles:
            c.enabled = toggles[c.id]
    job.keep_marks = [(float(s), float(e)) for s, e in keep_marks if e > s]
    for k, on in (point_toggles or {}).items():
        (job.point_off.discard if on else job.point_off.add)(k)
    plan = await asyncio.to_thread(make_plan, job)
    job.result = await asyncio.to_thread(write_draft, job, plan, draft_root)
    job.emit("rebuilt")
    if job.options.render:
        job.render.update(state="running", pct=0.0, error=None)
        asyncio.create_task(render_bg(job))                  # 수정할 때마다 완성본 자동 재렌더
    return job.result
