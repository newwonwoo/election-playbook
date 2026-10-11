"""FastAPI 로컬 서버: 업로드 → SSE 진행 → 결과/재빌드/다운로드. 127.0.0.1 전용."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel

from . import env, pipeline, points as P
from .asr import AsrService, Backend, default_backend

WEB = Path(__file__).resolve().parent.parent / "web"
MAX_BYTES = 500 << 20
ALLOWED = {".mp4", ".mov", ".m4v"}


class NewCut(BaseModel):
    start: float
    end: float
    label: str = ""


class RebuildReq(BaseModel):
    toggles: dict[int, bool] = {}
    keep_marks: list[tuple[float, float]] = []
    point_toggles: dict[str, bool] = {}
    add_cuts: list[NewCut] = []                    # 대본에서 지운 단어 → 직접 컷
    word_edits: dict[str, str | None] = {}         # 자막/팝업용 단어 고치기 (None = 되돌리기)


class CleanupReq(BaseModel):
    days: float = 30


class ClipReq(BaseModel):
    start: float
    end: float


def create_app(workdir: Path | None = None, backend: Backend | None = None,
               draft_root: Path | None = None) -> FastAPI:
    workdir = workdir or Path(os.environ.get("CAPCUT_WORKDIR", "workspace")).resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    store = pipeline.JobStore(workdir)
    store.sched = pipeline.Scheduler()
    store.load_all()                                  # 재시작해도 이전 작업이 남아 있다
    asr = AsrService(backend or default_backend(), workdir / "asr_cache")
    root = draft_root or env.capcut_draft_dir() or workdir / "output"
    app = FastAPI(title="캡컷 에이전트")

    def job_or_404(jid: str) -> pipeline.Job:
        j = store.jobs.get(jid)
        if not j:
            raise HTTPException(404, "작업을 찾을 수 없습니다")
        return j

    @app.get("/", response_class=HTMLResponse)
    def index():
        return (WEB / "index.html").read_text("utf-8")

    @app.get("/api/env")
    def api_env():
        d = env.check(workdir)
        d["draft_root"] = str(root)
        d["backend"] = asr.backend.name
        d["usage"] = store.usage()
        return d

    @app.post("/api/jobs")
    async def create_job(file: UploadFile = File(...), model: str = Form("small"),
                         threshold_db: float | None = Form(None), min_silence: float | None = Form(None),
                         pad: float | None = Form(None), aggressive: bool | None = Form(None),
                         subtitles: bool = Form(True), workflow: str = Form("longform"),
                         features: str = Form(""), glossary: str = Form(""), render: bool = Form(True)):
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise HTTPException(400, "mp4 / mov 파일만 지원합니다")
        if workflow not in P.PRESETS:
            raise HTTPException(400, "알 수 없는 워크플로입니다")
        try:
            feats = json.loads(features) if features else None
        except ValueError:
            raise HTTPException(400, "features는 JSON이어야 합니다")
        opts = pipeline.Options(model=model, threshold_db=threshold_db, min_silence=min_silence, pad=pad,
                                aggressive=aggressive, subtitles=subtitles, workflow=workflow,
                                features=feats, glossary=glossary, render=render)
        job = store.create(file.filename or "video" + ext, opts)
        size = 0
        with job.source.open("wb") as f:               # 스트리밍 저장(메모리에 통째로 올리지 않음)
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > MAX_BYTES:
                    f.close()
                    job.source.unlink(missing_ok=True)
                    raise HTTPException(413, "최대 500MB까지 지원합니다")
                f.write(chunk)
        asyncio.create_task(pipeline.run_queued(job, asr, root, store.sched))
        return {"id": job.id}

    @app.get("/api/jobs")
    def list_jobs(limit: int = 30):
        return store.list(limit)

    @app.get("/api/jobs/{jid}")
    def get_job(jid: str):
        return job_or_404(jid).public()

    @app.post("/api/jobs/{jid}/cancel")
    def cancel_job(jid: str):
        return {"status": pipeline.cancel(job_or_404(jid), store.sched)}

    @app.post("/api/jobs/{jid}/retry")
    async def retry_job(jid: str):
        job = job_or_404(jid)
        if job.status not in ("error", "cancelled"):
            raise HTTPException(409, "실패/취소된 작업만 다시 시도할 수 있습니다")
        if not job.source.exists():
            raise HTTPException(410, "원본 영상이 정리되어 다시 시도할 수 없습니다")
        job.events.clear()                              # 이전 실패/취소 이벤트가 새 화면에 먼저 재생되지 않게 즉시 비운다
        job.status, job.error = "queued", None
        asyncio.create_task(pipeline.run_queued(job, asr, root, store.sched))
        return {"status": "queued"}

    @app.delete("/api/jobs/{jid}")
    def delete_job(jid: str):
        job = job_or_404(jid)
        return {"freed": store.delete(job)}

    @app.get("/api/cleanup")
    def cleanup_preview(days: float = 30):
        old = store.stale(days)
        return {"days": days, "count": len(old), "bytes": sum(sum(store.size_of(p) for p in store.artifacts(j)) for j in old),
                "jobs": [j.summary() for j in old]}

    @app.post("/api/cleanup")
    def cleanup(req: CleanupReq):
        freed = sum(store.delete(j) for j in store.stale(req.days))
        return {"freed": freed, "usage": store.usage()}

    @app.get("/api/jobs/{jid}/events")
    async def events(jid: str):
        job = job_or_404(jid)

        async def gen():                                # 재접속해도 처음부터 리플레이
            i = 0
            while True:
                while i < len(job.events):
                    ev = job.events[i]
                    i += 1
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                    if ev["type"] in ("done", "error", "cancelled"):
                        return
                await asyncio.sleep(0.15)
        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/api/jobs/{jid}/rebuild")
    async def rebuild(jid: str, req: RebuildReq):
        job = job_or_404(jid)
        if job.status != "done":
            raise HTTPException(409, "아직 처리 중입니다")
        return await pipeline.rebuild(job, root, req.toggles, req.keep_marks, req.point_toggles,
                                      [c.model_dump() for c in req.add_cuts], req.word_edits, store.sched)

    @app.post("/api/jobs/{jid}/clip")
    async def clip(jid: str, req: ClipReq):
        job = job_or_404(jid)
        if job.status != "done":
            raise HTTPException(409, "아직 처리 중입니다")
        if req.end - req.start < 5:
            raise HTTPException(400, "5초 이상의 구간을 지정하세요")
        try:
            return await asyncio.to_thread(pipeline.build_clip, job, root, req.start, req.end)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @app.get("/api/presets")
    def presets():
        return {k: {"label": v["label"], "canvas": v["canvas"], "features": v["features"], "options": v["options"]}
                for k, v in P.PRESETS.items()}

    @app.get("/api/jobs/{jid}/video")
    def video(jid: str):
        job = job_or_404(jid)
        return FileResponse(job.source)                 # Range 지원 → 프리뷰 시크 가능

    @app.get("/api/jobs/{jid}/mp4")
    def mp4(jid: str, dl: int = 0):
        job = job_or_404(jid)
        f = job.files.get("main")
        if job.render["state"] != "done" or f is None or not Path(f).exists():
            raise HTTPException(409, "완성 영상이 아직 준비되지 않았습니다")
        name = Path(job.filename).stem + "_edited.mp4"
        return FileResponse(f, media_type="video/mp4", filename=name if dl else None)

    @app.post("/api/jobs/{jid}/render")
    async def render_again(jid: str):
        job = job_or_404(jid)
        if job.status != "done":
            raise HTTPException(409, "아직 처리 중입니다")
        asyncio.create_task(pipeline.render_bg(job, store.sched))
        return {"state": "running"}

    @app.get("/api/jobs/{jid}/files/{name}")
    def extra_file(jid: str, name: str):
        job = job_or_404(jid)
        f = job.files.get(name)
        if f is None or not Path(f).exists():
            raise HTTPException(404)
        return FileResponse(f, media_type="video/mp4", filename=name)

    @app.get("/api/jobs/{jid}/srt")
    def srt(jid: str):
        job = job_or_404(jid)
        f = job.dir / "subtitles.srt"
        if not f.exists():
            raise HTTPException(404)
        return FileResponse(f, filename=Path(job.filename).stem + ".srt")

    return app


def main() -> None:
    import uvicorn
    uvicorn.run(create_app(), host="127.0.0.1", port=int(os.environ.get("PORT", "8765")))


if __name__ == "__main__":
    main()
