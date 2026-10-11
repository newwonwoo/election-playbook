"""FastAPI 로컬 서버: 업로드 → SSE 진행 → 결과/재빌드/다운로드. 127.0.0.1 전용."""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel

from . import env, pipeline
from .asr import AsrService, Backend, default_backend

WEB = Path(__file__).resolve().parent.parent / "web"
MAX_BYTES = 500 << 20
ALLOWED = {".mp4", ".mov", ".m4v"}


class RebuildReq(BaseModel):
    toggles: dict[int, bool] = {}
    keep_marks: list[tuple[float, float]] = []


def create_app(workdir: Path | None = None, backend: Backend | None = None,
               draft_root: Path | None = None) -> FastAPI:
    workdir = workdir or Path(os.environ.get("CAPCUT_WORKDIR", "workspace")).resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    store = pipeline.JobStore(workdir)
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
        return d

    @app.post("/api/jobs")
    async def create_job(file: UploadFile = File(...), model: str = Form("small"),
                         threshold_db: float | None = Form(None), min_silence: float = Form(0.4),
                         pad: float = Form(0.12), aggressive: bool = Form(False),
                         subtitles: bool = Form(True)):
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise HTTPException(400, "mp4 / mov 파일만 지원합니다")
        opts = pipeline.Options(model=model, threshold_db=threshold_db, min_silence=min_silence,
                                pad=pad, aggressive=aggressive, subtitles=subtitles)
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
        asyncio.create_task(pipeline.run(job, asr, root))
        return {"id": job.id}

    @app.get("/api/jobs/{jid}")
    def get_job(jid: str):
        return job_or_404(jid).public()

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
                    if ev["type"] in ("done", "error"):
                        return
                await asyncio.sleep(0.15)
        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/api/jobs/{jid}/rebuild")
    async def rebuild(jid: str, req: RebuildReq):
        job = job_or_404(jid)
        if job.status != "done":
            raise HTTPException(409, "아직 처리 중입니다")
        return await pipeline.rebuild(job, root, req.toggles, req.keep_marks)

    @app.get("/api/jobs/{jid}/video")
    def video(jid: str):
        job = job_or_404(jid)
        return FileResponse(job.source)                 # Range 지원 → 프리뷰 시크 가능

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
