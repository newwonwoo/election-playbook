"""대본(Transcript)에서 잔말·NG(재촬영) 컷을 판정한다. 단어가 아니라 '대본 전체'를 보고 결정."""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from .asr import Transcript, Segment
from .cuts import Cut

FILLERS_STRICT = {"음", "으음", "음음", "어", "어어", "어어어", "아", "으", "흠", "에", "엄"}
FILLERS_AGGRESSIVE = FILLERS_STRICT | {"그", "저", "뭐", "막", "이제", "약간", "저기", "그러니까", "그니까"}
NG_MARKERS = ("엔지", "NG", "다시 갈게", "다시 할게", "다시 가겠", "컷")   # 말로 직접 NG 선언
_PUNCT = re.compile(r"[^\w가-힣]")


def norm(s: str) -> str:
    return _PUNCT.sub("", s).lower()


def _similar(a: Segment, b: Segment) -> float:
    na, nb = norm(a.text), norm(b.text)
    if len(na) < 4 or len(nb) < 4:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def detect(tr: Transcript, *, aggressive: bool = False, retake_gap: float = 20.0,
           similarity: float = 0.6) -> list[tuple[str, float, float, str]]:
    """반환: (kind, start, end, label). id/enabled는 호출 측에서 부여."""
    fillers = FILLERS_AGGRESSIVE if aggressive else FILLERS_STRICT
    found: list[tuple[str, float, float, str]] = []
    ng_segments: set[int] = set()
    segs = tr.segments

    # 1) NG: 말로 선언했거나, 뒤에 유사한 문장이 다시 나오면 앞 테이크를 버린다(마지막 테이크 유지)
    for i, s in enumerate(segs):
        if any(m in s.text for m in NG_MARKERS):
            ng_segments.add(i)
            found.append(("ng", s.start, s.end, f"NG 선언: {s.text[:20]}"))
            continue
        for j in range(i + 1, len(segs)):
            if segs[j].start - s.end > retake_gap:
                break
            if _similar(s, segs[j]) >= similarity:
                ng_segments.add(i)
                found.append(("ng", s.start, s.end, f"재촬영: {s.text[:20]}"))
                break

    # 2) 잔말: NG에 포함되지 않은 세그먼트의 필러 단어 + 말더듬(같은 단어 연속)
    for i, s in enumerate(segs):
        if i in ng_segments:
            continue
        ws = s.words
        for k, w in enumerate(ws):
            t = norm(w.text)
            if t in fillers:
                found.append(("filler", w.start, w.end, w.text))
            elif k + 1 < len(ws) and t and t == norm(ws[k + 1].text) and len(t) <= 4:
                found.append(("filler", w.start, w.end, f"반복: {w.text}"))
    return found


def to_cuts(found: list[tuple[str, float, float, str]], start_id: int = 0) -> list[Cut]:
    return [Cut(start_id + i, k, s, e, label) for i, (k, s, e, label) in enumerate(sorted(found, key=lambda x: x[1]))]
