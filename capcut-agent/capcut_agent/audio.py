"""ffmpeg로 16kHz mono PCM을 읽고 적응형 임계값으로 발화 구간을 찾는다."""
from __future__ import annotations

import json
import subprocess

import numpy as np

from .cuts import Interval, merge

SR = 16000
FRAME = 0.02  # 20ms


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True, check=True).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    if a is None:
        raise ValueError("오디오 트랙이 없는 영상입니다")
    fps = 30.0
    if v and v.get("r_frame_rate", "0/0") not in ("0/0", ""):
        n, d = v["r_frame_rate"].split("/")
        fps = float(n) / float(d) if float(d) else 30.0
    return {
        "duration": float(info["format"]["duration"]),
        "width": int(v["width"]) if v else 1920,
        "height": int(v["height"]) if v else 1080,
        "fps": round(fps) or 30,
        "has_video": v is not None,
    }


def load_pcm(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def frame_db(samples: np.ndarray) -> np.ndarray:
    n = int(SR * FRAME)
    k = len(samples) // n
    if k == 0:
        return np.array([-90.0])
    fr = samples[: k * n].reshape(k, n)
    rms = np.sqrt((fr ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-9)


def auto_threshold(db: np.ndarray) -> float:
    """노이즈 플로어(하위 10%)와 발화 레벨(상위 90%) 사이 35% 지점. -55~-25dB로 제한.

    고정 -30dB는 조용한 방/시끄러운 방에서 모두 어긋나서 적응형으로 바꾼다."""
    floor, loud = np.percentile(db, 10), np.percentile(db, 90)
    thr = floor + (loud - floor) * 0.35
    return float(min(-25.0, max(-55.0, thr)))


def detect_speech(samples: np.ndarray, *, threshold_db: float | None = None,
                  min_silence: float = 0.4, min_speech: float = 0.12) -> tuple[list[Interval], float]:
    """발화 구간 목록과 실제 사용된 임계값(dB)."""
    db = frame_db(samples)
    thr = auto_threshold(db) if threshold_db is None else threshold_db
    voiced = db > thr
    spans: list[Interval] = []
    start = None
    for i, v in enumerate(voiced):
        if v and start is None:
            start = i
        elif not v and start is not None:
            spans.append((start * FRAME, i * FRAME))
            start = None
    if start is not None:
        spans.append((start * FRAME, len(voiced) * FRAME))
    spans = merge(spans, gap=min_silence)          # 짧은 쉼은 발화 안으로 흡수
    spans = [(s, e) for s, e in spans if e - s >= min_speech]
    return spans, thr


def waveform_peaks(samples: np.ndarray, bins: int = 600) -> list[float]:
    """타임라인 파형용 0~1 피크 배열."""
    if len(samples) == 0:
        return []
    k = max(1, len(samples) // bins)
    n = len(samples) // k
    pk = np.abs(samples[: n * k]).reshape(n, k).max(axis=1)
    m = float(pk.max()) or 1.0
    return [round(float(x) / m, 3) for x in pk]
