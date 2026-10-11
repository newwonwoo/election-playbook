"""한국어 텍스트 휴리스틱: 조사 제거, 내용어 추출, 숫자/핵심어 판별."""
from __future__ import annotations

import re

_PUNCT = re.compile(r"[^\w가-힣%]")
JOSA2 = ("에서", "으로", "에게", "까지", "부터", "처럼", "보다", "라고", "이라", "에는", "에도", "으로")
JOSA1 = "은는이가을를의에도로과와만"
STOP = {"그", "이", "저", "것", "수", "등", "때", "좀", "정말", "진짜", "그리고", "그래서", "하지만", "그런데",
        "그러니까", "근데", "이제", "지금", "그냥", "너무", "아주", "제가", "저는", "우리", "여러분", "오늘",
        "이게", "그게", "이건", "그건", "여기", "거기", "이렇게", "그렇게", "무엇", "어떤", "다시", "바로"}
STRONG = {"절대", "반드시", "핵심", "중요", "주의", "위험", "문제", "실수", "꼭", "무조건", "최대", "최소",
          "필수", "오히려", "전혀", "결국", "치명적", "포인트", "비밀", "충격", "아무도", "대부분"}
DOMAIN = {"채권", "연체", "보증", "대위변제", "구상", "회수", "담보", "보증료", "한도", "상각", "추심",
          "신용", "대출", "이자", "만기", "연체율", "부실", "채무", "변제", "압류", "경매"}
NUM_WORD = set("영일이삼사오육칠팔구십백천만억")
UNIT = {"퍼센트", "프로", "원", "억", "만원", "배", "개월", "년", "일", "명", "건", "위", "억원", "천만원"}
_DIGIT = re.compile(r"\d")


def norm(s: str) -> str:
    return _PUNCT.sub("", s)


def strip_josa(w: str) -> str:
    w = norm(w)
    if len(w) >= 4 and w.endswith(JOSA2):
        return w[:-2]
    if len(w) >= 3 and w[-1] in JOSA1 and not _DIGIT.search(w[-1]):
        return w[:-1]
    return w


def has_digit(w: str) -> bool:
    return bool(_DIGIT.search(w))


def is_numeral_word(w: str) -> bool:
    w = norm(w)
    return bool(w) and all(c in NUM_WORD for c in w)


def content_tokens(text: str) -> list[str]:
    out = []
    for raw in text.split():
        t = strip_josa(raw)
        if len(t) < 2 or t in STOP or t[-1] in "다요죠까네" or has_digit(t):
            continue
        out.append(t)
    return out


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


_NUM_UNIT = re.compile(r"^[\d][\d,\.]*(?:" + "|".join(sorted(map(re.escape, UNIT | {"%"}), key=len, reverse=True)) + r")?")


def number_text(w: str) -> str:
    """'5년이며' → '5년', '30%를' → '30%'. 서술어/조사는 팝업에서 뗀다."""
    m = _NUM_UNIT.match(norm(w))
    return m.group(0) if m else strip_josa(w)


def stem_hit(w: str, vocab: set[str]) -> str | None:
    """'핵심입니다' → '핵심'. 서술어가 붙은 용언형도 어간(접두)으로 매칭. 가장 긴 키워드 우선."""
    w = norm(w)
    hits = [k for k in vocab if len(k) >= 2 and w.startswith(k)]
    return max(hits, key=len) if hits else None
