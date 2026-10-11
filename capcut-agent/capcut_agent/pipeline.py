"""작업(Job) 모델 + 파이프라인: silence → asr → filler → draft. 각 단계는 SSE 이벤트로 노출."""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from dataclasses import dataclass, asdict, field
from pathlib import Path

from . import audio, cuts as C, draft, filler, subtitles
from .asr import AsrService, Transcript

STAGES = [("silence", "무음 감지"), ("asr", "음성 인식"), ("filler", "잔말·NG 판정"), ("draft", "드래프트 생성")]
MIN_STAGE = float(os.environ.get("CAPCUT_MIN_STAGE", "0.4"))   # 캐시 hit여도 단계가 눈에 보이도록


@dataclass
class Options:
    model: str = "small"
    threshold_db: float | None = None      # None = 적응형
    min_silence: float = 0.4
    pad: float = 0.12                      # 컷 경계에 남기는 숨쉬기 여유
    aggressive: bool = False
    subtitles: bool = True


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

    def emit(self, type_: str, **data) -> None:
        self.events.append({"i": len(self.events), "t": round(time.time(), 2), "type": type_, **data})

    def public(self) -> dict:
        return {"id": self.id, "filename": self.filename, "status": self.status,
                "error": self.error, "result": self.result, "stages": [{"key": k, "label": l} for k, l in STAGES]}


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


def build_result(job: Job, draft_root: Path) -> dict:
    """현재 cuts/keep_marks 기준으로 keep 계산 → 자막 → 드래프트. ASR 재실행 없음."""
    dur = job.info["duration"]
    keep = C.compute_keep(dur, job.cuts, job.keep_marks)
    if not keep:
        raise ValueError("남는 구간이 없어요. 말이 감지되지 않았거나 컷이 전부 활성화돼 있습니다 (무음 기준 dB를 낮춰보세요)")
    subs = subtitles.build(job.transcript, keep)
    name = draft.safe_name(Path(job.filename).stem) + "_" + job.id[:4]
    path = draft.build(str(job.source), job.info, keep, subs, draft_root, name, job.options.subtitles)
    (job.dir / "subtitles.srt").write_text(subtitles.to_srt(subs), "utf-8")
    out = C.total(keep)
    counts = {k: sum(1 for c in job.cuts if c.kind == k and c.enabled) for k in ("silence", "filler", "ng")}
    return {
        "duration": round(dur, 3), "out_duration": round(out, 3), "saved": round(dur - out, 3),
        "saved_pct": round((dur - out) / dur * 100, 1) if dur else 0,
        "keep": [[round(s, 3), round(e, 3)] for s, e in keep],
        "cuts": [c.to_dict() for c in job.cuts], "keep_marks": [list(k) for k in job.keep_marks],
        "counts": counts, "subtitle_count": len(subs), "draft_path": str(path), "draft_name": name,
        "info": job.info, "transcript": job.transcript.to_dict(),
        "peaks": job.result["peaks"] if job.result else [], "threshold_db": job.result["threshold_db"] if job.result else None,
        "asr": job.result["asr"] if job.result else {},
    }


async def run(job: Job, asr: AsrService, draft_root: Path) -> None:
    o = job.options
    job.status = "running"
    try:
        job.info = await asyncio.to_thread(audio.probe, str(job.source))
        meta: dict = {}

        async def s_silence():
            samples = await asyncio.to_thread(audio.load_pcm, str(job.source))
            speech, thr = audio.detect_speech(samples, threshold_db=o.threshold_db, min_silence=o.min_silence)
            meta.update(speech=speech, thr=thr, peaks=audio.waveform_peaks(samples), samples=samples)
        await _stage(job, "silence", s_silence)

        async def s_asr():
            job.transcript, cached = await asr.transcribe(str(job.source), meta.pop("samples"), o.model)
            meta["cached"] = cached
        await _stage(job, "asr", s_asr)

        async def s_filler():
            found = _silence_cuts(meta["speech"], job.info["duration"], o)
            found += filler.detect(job.transcript, aggressive=o.aggressive)
            job.cuts = [C.Cut(i, k, s, e, l) for i, (k, s, e, l) in enumerate(found)]
        await _stage(job, "filler", s_filler)

        async def s_draft():
            job.result = {"peaks": meta["peaks"], "threshold_db": round(meta["thr"], 1),
                          "asr": {"backend": asr.backend.name, "model": o.model, "cached": meta["cached"]}}
            job.result = await asyncio.to_thread(build_result, job, draft_root)
        await _stage(job, "draft", s_draft)
        job.status = "done"
        job.emit("done")
    except Exception as e:  # noqa: BLE001 - 사용자에게 원인을 그대로 보여준다
        job.status, job.error = "error", f"{type(e).__name__}: {e}"
        job.emit("error", message=job.error)


async def rebuild(job: Job, draft_root: Path, toggles: dict[int, bool], keep_marks: list[tuple[float, float]]) -> dict:
    for c in job.cuts:
        if c.id in toggles:
            c.enabled = toggles[c.id]
    job.keep_marks = [(float(s), float(e)) for s, e in keep_marks if e > s]
    job.result = await asyncio.to_thread(build_result, job, draft_root)
    job.emit("rebuilt")
    return job.result
