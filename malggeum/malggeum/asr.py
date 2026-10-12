"""ASR 백엔드(mlx-whisper / faster-whisper), 대본 데이터 모델, content-hash 캐시."""
from __future__ import annotations

import asyncio
import hashlib
import json
import platform
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Protocol

import numpy as np


@dataclass
class Word:
    start: float
    end: float
    text: str


@dataclass
class Segment:
    start: float
    end: float
    text: str
    words: list[Word] = field(default_factory=list)


@dataclass
class Transcript:
    language: str
    segments: list[Segment]

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Transcript":
        return cls(d["language"], [
            Segment(s["start"], s["end"], s["text"], [Word(**w) for w in s["words"]])
            for s in d["segments"]])


class Backend(Protocol):
    name: str

    def transcribe(self, samples: "np.ndarray", model: str) -> Transcript: ...


def pick_track() -> str:
    """Step 0: OS 감지 → 트랙. A=Mac M칩(mlx), C=Windows, fallback=그 외."""
    s, m = platform.system(), platform.machine().lower()
    if s == "Darwin" and m == "arm64":
        return "A"
    if s == "Windows":
        return "C"
    return "fallback"


class FasterWhisperBackend:
    name = "faster-whisper"

    def __init__(self) -> None:
        self._models: dict[str, object] = {}

    def transcribe(self, samples: np.ndarray, model: str) -> Transcript:
        from faster_whisper import WhisperModel
        if model not in self._models:
            self._models[model] = WhisperModel(model, compute_type="int8")
        segs, info = self._models[model].transcribe(
            samples, language="ko", word_timestamps=True, vad_filter=True, beam_size=5)
        out = []
        for s in segs:
            words = [Word(w.start, w.end, w.word.strip()) for w in (s.words or []) if w.word.strip()]
            out.append(Segment(s.start, s.end, s.text.strip(), words))
        return Transcript(info.language, out)


class MlxWhisperBackend:
    name = "mlx-whisper"
    _REPO = {"tiny": "mlx-community/whisper-tiny-mlx", "base": "mlx-community/whisper-base-mlx",
             "small": "mlx-community/whisper-small-mlx", "medium": "mlx-community/whisper-medium-mlx",
             "large-v3": "mlx-community/whisper-large-v3-mlx"}

    def transcribe(self, samples: np.ndarray, model: str) -> Transcript:
        import mlx_whisper
        r = mlx_whisper.transcribe(samples, path_or_hf_repo=self._REPO.get(model, model),
                                   language="ko", word_timestamps=True)
        out = []
        for s in r["segments"]:
            words = [Word(w["start"], w["end"], w["word"].strip()) for w in s.get("words", []) if w["word"].strip()]
            out.append(Segment(s["start"], s["end"], s["text"].strip(), words))
        return Transcript("ko", out)


def default_backend() -> Backend:
    if pick_track() == "A":
        try:
            import mlx_whisper  # noqa: F401
            return MlxWhisperBackend()
        except ImportError:
            pass
    return FasterWhisperBackend()


def content_hash(path: str) -> str:
    """mtime 기반 캐시는 매 업로드마다 miss → 내용(앞/뒤 4MB+크기) 해시."""
    p = Path(path)
    size = p.stat().st_size
    h = hashlib.sha256(str(size).encode())
    with p.open("rb") as f:
        h.update(f.read(4 << 20))
        if size > (8 << 20):
            f.seek(-(4 << 20), 2)
            h.update(f.read())
    return h.hexdigest()[:24]


class AsrService:
    """ASR은 asyncio.Lock으로 직렬화(numba 비안전 → 동시 호출 시 segfault)."""

    def __init__(self, backend: Backend, cache_dir: Path) -> None:
        self.backend, self.cache_dir = backend, cache_dir
        self.lock = asyncio.Lock()
        cache_dir.mkdir(parents=True, exist_ok=True)

    async def transcribe(self, path: str, samples: np.ndarray, model: str) -> tuple[Transcript, bool]:
        """samples = ffmpeg로 이미 디코딩한 16kHz mono PCM (PyAV 의존 제거, 이중 디코딩 방지)."""
        key = f"{content_hash(path)}-{model}-{self.backend.name}"
        f = self.cache_dir / f"{key}.json"
        if f.exists():
            return Transcript.from_dict(json.loads(f.read_text("utf-8"))), True
        async with self.lock:
            tr = await asyncio.to_thread(self.backend.transcribe, samples, model)
        f.write_text(json.dumps(tr.to_dict(), ensure_ascii=False), "utf-8")
        return tr, False
