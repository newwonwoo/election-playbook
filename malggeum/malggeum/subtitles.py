"""keep 구간 기준으로 대본을 출력 타임라인 자막으로 변환(세그먼트 단위, 잔말 제거 반영)."""
from __future__ import annotations

from dataclasses import dataclass

from .asr import Transcript
from .cuts import Interval, remap_clamp


@dataclass
class Sub:
    start: float   # 출력 타임라인(초)
    end: float
    text: str


def _kept(t: float, keep: list[Interval]) -> bool:
    return any(s <= t <= e for s, e in keep)


def build(tr: Transcript, keep: list[Interval], max_chars: int = 18, fixes: dict[str, str] | None = None) -> list[Sub]:
    subs: list[Sub] = []
    for seg in tr.segments:
        words = [w for w in seg.words if _kept((w.start + w.end) / 2, keep)]
        if not words:
            continue
        # 긴 문장은 max_chars 단위로 줄 나눔(단어 경계)
        lines: list[list] = [[]]
        for w in words:
            cur = " ".join(x.text for x in lines[-1] + [w])
            if lines[-1] and len(cur) > max_chars:
                lines.append([])
            lines[-1].append(w)
        for ln in lines:
            s, e = remap_clamp(ln[0].start, keep), remap_clamp(ln[-1].end, keep)
            if e <= s:
                continue
            txt = " ".join(x.text for x in ln)
            for a, b in (fixes or {}).items():          # 용어 사전 교정 (예: "채권 관리"→"채권관리")
                txt = txt.replace(a, b)
            subs.append(Sub(s, e, txt))
    # 자막끼리 겹침 방지
    for a, b in zip(subs, subs[1:]):
        if a.end > b.start:
            a.end = b.start
    return [s for s in subs if s.end - s.start > 0.05]


def to_srt(subs: list[Sub]) -> str:
    def ts(t: float) -> str:
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"
    return "\n".join(f"{i}\n{ts(s.start)} --> {ts(s.end)}\n{s.text}\n" for i, s in enumerate(subs, 1))
