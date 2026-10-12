"""Step 0: OS 감지 + 환경 점검. 빠진 도구는 설치 명령만 안내한다."""
from __future__ import annotations

import os
import platform
import shutil
import sys
from pathlib import Path

from .asr import pick_track


def capcut_draft_dir() -> Path | None:
    """CapCut 드래프트 폴더. 환경변수 CAPCUT_DRAFT_DIR가 우선."""
    if os.environ.get("CAPCUT_DRAFT_DIR"):
        return Path(os.environ["CAPCUT_DRAFT_DIR"])
    home = Path.home()
    cands = []
    if platform.system() == "Darwin":
        cands = [home / "Movies/CapCut/User Data/Projects/com.lveditor.draft"]
    elif platform.system() == "Windows":
        cands = [Path(os.environ.get("LOCALAPPDATA", "")) / "CapCut/User Data/Projects/com.lveditor.draft"]
    return next((c for c in cands if c.exists()), None)


def install_hint(tool: str) -> str:
    mac, win = platform.system() == "Darwin", platform.system() == "Windows"
    return {
        "ffmpeg": "brew install ffmpeg" if mac else "winget install ffmpeg" if win else "sudo apt install ffmpeg",
        "python": "brew install python@3.11" if mac else "https://python.org 에서 3.9+ 설치",
    }.get(tool, "")


def check(workdir: Path) -> dict:
    track = pick_track()
    free_gb = shutil.disk_usage(workdir if workdir.exists() else workdir.parent).free / 1e9
    ff, fp = shutil.which("ffmpeg"), shutil.which("ffprobe")
    dd = capcut_draft_dir()
    try:
        import pycapcut  # noqa: F401
        pc = True
    except ImportError:
        pc = False
    items = [
        {"key": "ffmpeg", "ok": bool(ff and fp), "detail": "ffmpeg/ffprobe" if ff and fp else install_hint("ffmpeg")},
        {"key": "pycapcut", "ok": pc, "detail": "pycapcut" if pc else "pip install pycapcut"},
        {"key": "capcut", "ok": dd is not None, "detail": str(dd) if dd else "CapCut 설치+1회 실행 필요 → 드래프트는 output/ 폴더에 저장됨"},
        {"key": "disk", "ok": free_gb >= 5, "detail": f"{free_gb:.0f} GB 여유"},
    ]
    return {"os": platform.system(), "arch": platform.machine(), "track": track,
            "python": sys.version.split()[0], "items": items,
            "ready": all(i["ok"] for i in items if i["key"] in ("ffmpeg", "pycapcut"))}
