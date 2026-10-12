"""Clef-omni에 보낼 짧은 영상 조각(480p·15fps·소리 포함) 만들기 + 구간 나누기."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from .media import Src


def windows(sources: list[Src], win: float = 8.0, min_last: float = 3.0) -> list[tuple[float, float]]:
    """영상별로 win초 단위 구간(전체 타임라인 기준). 마지막이 min_last보다 짧으면 앞 구간에 합친다. 영상 경계를 넘지 않는다."""
    out: list[tuple[float, float]] = []
    for s in sources:
        t, ws = 0.0, []
        while t < s.duration - 1e-6:
            ws.append([t, min(t + win, s.duration)])
            t += win
        if len(ws) > 1 and ws[-1][1] - ws[-1][0] < min_last:
            ws[-2][1] = ws[-1][1]
            ws.pop()
        out += [(s.offset + a, s.offset + b) for a, b in ws]
    return out


def locate(sources: list[Src], t: float) -> Src:
    for s in sources:
        if s.offset <= t < s.end:
            return s
    return sources[-1]


def cut_clip(src_path: str, local_s: float, local_e: float, *, height: int = 480, fps: int = 15) -> bytes:
    """원본에서 [local_s, local_e] 구간을 작은 mp4로. 소리를 포함(Clef-omni는 모든 영상에 소리가 있을 때만 소리를 듣는다)."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "c.mp4"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{local_s:.3f}", "-t", f"{local_e - local_s:.3f}", "-i", src_path,
                        "-vf", f"scale=-2:{height},fps={fps}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "48k", "-ac", "1", "-movflags", "+faststart", str(out)],
                       check=True, capture_output=True)
        return out.read_bytes()
