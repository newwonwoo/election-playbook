"""편집 포인트 탐지: 훅 · 강조 · 챕터 · 줌 · 음량 · 숏츠 후보. 전부 순수 함수(테스트 용이).

모든 시각은 '원본 타임라인(초)'. 출력 타임라인 변환은 plan.py가 담당한다."""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field, asdict

import numpy as np

from . import text as T
from .asr import Segment, Transcript, Word
from .audio import SR
from .cuts import Interval, remap_clamp

# ---- 워크플로 프리셋: 어떤 편집 포인트를 어떤 강도로 쓸지 ------------------------------------
PRESETS: dict[str, dict] = {
    "shorts": {"label": "숏폼 (쇼츠·릴스·틱톡)", "canvas": "9:16",
               "features": {"hook": True, "zoom": True, "emphasis": True, "chapters": False, "loudness": True},
               "zoom_every": 3.5, "zoom_scale": 1.15, "emphasis_gap": 3.0, "emphasis_per_min": 10,
               "min_chapter": 0, "sub_chars": 12, "sub_size": 10.0, "options": {"aggressive": True, "pad": 0.08, "min_silence": 0.3}},
    "longform": {"label": "유튜브 롱폼", "canvas": "16:9",
                 "features": {"hook": True, "zoom": True, "emphasis": True, "chapters": True, "loudness": True},
                 "zoom_every": 8.0, "zoom_scale": 1.08, "emphasis_gap": 6.0, "emphasis_per_min": 5,
                 "min_chapter": 60, "sub_chars": 20, "sub_size": 7.0, "options": {"aggressive": False, "pad": 0.12, "min_silence": 0.4}},
    "lecture": {"label": "강의·설명 (교육 콘텐츠)", "canvas": "16:9",
                "features": {"hook": False, "zoom": False, "emphasis": True, "chapters": True, "loudness": True},
                "zoom_every": 12.0, "zoom_scale": 1.06, "emphasis_gap": 8.0, "emphasis_per_min": 4,
                "min_chapter": 45, "sub_chars": 22, "sub_size": 7.0, "options": {"aggressive": False, "pad": 0.15, "min_silence": 0.5}},
}
KINDS = {"hook": "훅", "zoom": "줌", "emphasis": "강조", "chapter": "챕터", "loudness": "음량", "highlight": "숏츠"}


@dataclass
class EditPoint:
    key: str                  # 안정적 식별자(kind:원본시각) — 사용자 토글 유지용
    kind: str
    start: float
    end: float
    label: str
    score: float = 0.0
    enabled: bool = True
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["start"], d["end"], d["score"] = round(self.start, 2), round(self.end, 2), round(self.score, 2)
        return d


def _key(kind: str, t: float) -> str:
    return f"{kind}:{t:.1f}"


def _in_keep(t: float, keep: list[Interval]) -> bool:
    return any(s <= t <= e for s, e in keep)


def seg_in_keep(seg: Segment, keep: list[Interval]) -> bool:
    ws = seg.words or []
    return bool(ws) and all(_in_keep((w.start + w.end) / 2, keep) for w in ws)


# ---- 음량(에너지) ---------------------------------------------------------------------------
def span_db(samples: np.ndarray, s: float, e: float) -> float:
    a, b = int(max(0, s) * SR), int(max(s + 0.05, e) * SR)
    x = samples[a:b]
    return float(20 * np.log10(np.sqrt((x ** 2).mean() + 1e-12) + 1e-9)) if len(x) else -90.0


def zscores(vals: list[float]) -> list[float]:
    if not vals:
        return []
    a = np.array(vals)
    med = np.median(a)
    mad = np.median(np.abs(a - med)) * 1.4826 or float(a.std()) or 1.0
    return [float((v - med) / mad) for v in a]


# ---- 1) 강조 팝업 ---------------------------------------------------------------------------
def detect_emphasis(tr: Transcript, samples: np.ndarray, keep: list[Interval], *, min_gap: float = 6.0,
                    per_min: float = 5, extra_terms: set[str] | None = None, threshold: float = 2.0) -> list[EditPoint]:
    terms = T.DOMAIN | (extra_terms or set())
    words: list[tuple[Word, Word | None]] = []
    for seg in tr.segments:
        for i, w in enumerate(seg.words):
            if _in_keep((w.start + w.end) / 2, keep):
                words.append((w, seg.words[i - 1] if i else None))
    if not words:
        return []
    zs = zscores([span_db(samples, w.start, w.end) for w, _ in words])
    cands: list[EditPoint] = []
    for n, ((w, prev), z) in enumerate(zip(words, zs)):
        base = T.strip_josa(w.text)
        score, why = 0.0, []
        nxt = words[n + 1][0] if n + 1 < len(words) else None
        if T.has_digit(base):
            score += 2.0; why.append("숫자")
            base = T.number_text(w.text)
            if nxt is not None and T.strip_josa(nxt.text) in T.UNIT and nxt.start - w.end < 0.4 and base == T.norm(w.text)[:len(base)] \
                    and base.isdigit():                               # "70" + "퍼센트"
                base += T.strip_josa(nxt.text)
        elif base in T.UNIT and prev is not None and (T.is_numeral_word(prev.text) or T.has_digit(prev.text)):
            if T.has_digit(prev.text):
                continue                                   # 앞 단어(숫자)가 단위까지 흡수했다
            score += 2.0; why.append("수치"); base = T.norm(prev.text) + base
        strong = T.stem_hit(w.text, T.STRONG)
        if strong:
            score += 1.5; why.append("강조어"); base = strong
        term = T.stem_hit(w.text, terms)
        if term:
            score += 1.0; why.append("핵심용어")
            if not strong and score < 2.0:
                base = term
        if z >= 1.0 and score > 0:                 # 큰 소리는 '가산점'일 뿐, 단독으로 팝업을 만들지 않는다
            score += 1.0 if z < 2 else 1.5; why.append("목소리↑")
        if score >= threshold:
            cands.append(EditPoint(_key("emphasis", w.start), "emphasis", w.start, w.end,
                                   base[:10], score, True, {"text": base[:10], "why": "+".join(why)}))
    # 밀도 제어: 점수 높은 순으로 고르되 최소 간격/분당 개수 제한
    chosen: list[EditPoint] = []
    total = sum(e - s for s, e in keep) or 1.0
    cap = max(1, math.ceil(per_min * total / 60))
    for c in sorted(cands, key=lambda c: -c.score):
        if len(chosen) >= cap:
            break
        if not all(abs(c.start - x.start) >= min_gap for x in chosen):
            continue
        if not T.has_digit(c.data["text"]) and any(x.data["text"] == c.data["text"] and abs(c.start - x.start) < 20.0 for x in chosen):
            continue                                   # 같은 용어를 20초 안에 또 띄우면 산만 → 숫자 외에는 건너뜀
        chosen.append(c)
    return sorted(chosen, key=lambda c: c.start)


# ---- 2) 오프닝 훅 ---------------------------------------------------------------------------
_HOOK_WORDS = {"사실", "진짜", "왜", "어떻게", "비밀", "이유", "실수", "절대", "결국", "핵심", "문제", "위험",
               "충격", "아무도", "대부분", "모르는", "반드시", "순간"}
_DANGLING = ("이게", "그게", "이건", "그건", "그래서", "그러니까", "이렇게", "그리고", "그러면", "그럼", "그런데",
             "음", "어", "아", "그니까", "근데")
_Q = re.compile(r"(\?|까요|나요|일까|인가요|뭘까요|할까요|있을까)\s*$")


def hook_score(seg: Segment, z_loud: float = 0.0) -> tuple[float, str]:
    t = seg.text.strip()
    n = len(T.norm(t))
    score, why = 0.0, []
    if _Q.search(t):
        score += 1.5; why.append("질문")
    if T.has_digit(t):
        score += 1.5; why.append("숫자")
    hits = [w for w in _HOOK_WORDS if w in t]
    if hits:
        score += min(2, len(hits)) * 1.0; why.append("훅단어")
    if re.search(r"하지만|오히려|반대로|아니라|그런데도", t):
        score += 0.5; why.append("반전")
    if 8 <= n <= 40:
        score += 1.0
    elif n > 60:
        score -= 1.0
    if z_loud >= 0.8:
        score += 0.7; why.append("목소리↑")
    if t.startswith(_DANGLING):
        score -= 2.0; why.append("앞문맥필요")
    return score, "+".join(why)


def detect_hook(tr: Transcript, samples: np.ndarray, keep: list[Interval], *, min_total: float = 25.0,
                skip_head: float = 8.0, threshold: float = 3.0) -> list[EditPoint]:
    total = sum(e - s for s, e in keep)
    if total < min_total:
        return []
    segs = [s for s in tr.segments if seg_in_keep(s, keep) and 1.5 <= s.end - s.start <= 7.0]
    if not segs:
        return []
    zs = zscores([span_db(samples, s.start, s.end) for s in segs])
    best: EditPoint | None = None
    for seg, z in zip(segs, zs):
        if remap_clamp(seg.start, keep) < skip_head:         # 이미 앞부분에 있는 문장은 티저 의미 없음
            continue
        sc, why = hook_score(seg, z)
        if sc >= threshold and (best is None or sc > best.score):
            best = EditPoint(_key("hook", seg.start), "hook", seg.words[0].start, seg.words[-1].end,
                             seg.text.strip()[:28], sc, True, {"why": why, "text": seg.text.strip()})
    return [best] if best else []


# ---- 3) 챕터 --------------------------------------------------------------------------------
_MARKERS = ("다음으로", "다음은", "다음 주제", "먼저", "첫째", "첫 번째", "첫번째", "둘째", "두 번째", "두번째", "셋째",
            "세 번째", "세번째", "넷째", "마지막으로", "자 ", "자,", "그럼", "그러면", "정리하면", "결론", "이번에는",
            "이제 ", "그다음", "한 가지 더", "두 가지", "세 가지", "첫 번째로")


def _chapter_title(segs: list[Segment]) -> str:
    c = Counter(t for s in segs for t in T.content_tokens(s.text))
    top = [t for t, _ in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:2]]
    return " · ".join(top) if top else ""


def detect_chapters(tr: Transcript, keep: list[Interval], *, min_len: float = 45.0, max_chapters: int = 12) -> list[EditPoint]:
    segs = [s for s in tr.segments if s.words and any(_in_keep((w.start + w.end) / 2, keep) for w in s.words)]
    total = sum(e - s for s, e in keep)
    if len(segs) < 4 or total < min_len * 2:
        return []
    cands: list[tuple[float, int, str]] = []
    for i in range(1, len(segs)):
        gap = segs[i].start - segs[i - 1].end
        sc, why = 0.0, []
        if gap >= 2.0:
            sc += 1.5; why.append("긴 휴지")
        elif gap >= 1.0:
            sc += 0.8; why.append("휴지")
        if segs[i].text.lstrip().startswith(_MARKERS):
            sc += 2.0; why.append("전환어")
        before = {t for s in segs[max(0, i - 4):i] for t in T.content_tokens(s.text)}
        after = {t for s in segs[i:i + 4] for t in T.content_tokens(s.text)}
        if len(before) >= 6 and len(after) >= 6:
            j = T.jaccard(before, after)
            if j < 0.08:
                sc += 1.2; why.append("주제어 변화")
            elif j < 0.15:
                sc += 0.6; why.append("주제어 변화")
        if sc >= 2.5:
            cands.append((sc, i, "+".join(why)))
    pos = lambda t: remap_clamp(t, keep)          # noqa: E731 - 출력 타임라인 기준 길이로 최소 간격 판단
    accepted: list[tuple[float, int, str]] = []
    for sc, i, why in sorted(cands, reverse=True):
        t = pos(segs[i].start)
        if t < min_len * 0.7 or total - t < min_len * 0.5:
            continue
        if all(abs(t - pos(segs[j].start)) >= min_len for _, j, _ in accepted):
            accepted.append((sc, i, why))
    accepted = sorted(accepted, key=lambda a: a[1])[: max_chapters - 1]
    if not accepted:
        return []
    idx = [0] + [i for _, i, _ in accepted] + [len(segs)]
    out: list[EditPoint] = []
    for n in range(len(idx) - 1):
        chunk = segs[idx[n]:idx[n + 1]]
        title = _chapter_title(chunk) or ("오프닝" if n == 0 else f"파트 {n + 1}")
        why = "시작" if n == 0 else accepted[n - 1][2]
        out.append(EditPoint(_key("chapter", chunk[0].start), "chapter", chunk[0].start, chunk[-1].end,
                             f"{n + 1:02d} {title}", 0.0 if n == 0 else accepted[n - 1][0], True,
                             {"title": title, "why": why, "index": n + 1}))
    return out


# ---- 4) 리듬 줌: keep 구간을 문장 경계에서 쪼개 100%↔줌 교차 -------------------------------------
def split_for_zoom(keep: list[Interval], tr: Transcript, every: float) -> list[Interval]:
    """한 클립이 every초를 넘기면 다음 문장 시작에서 분할. 단어 중간은 절대 자르지 않는다."""
    starts = sorted(w.start for s in tr.segments for w in s.words[:1])
    out: list[Interval] = []
    for s, e in keep:
        cur = s
        for b in starts:
            if cur + every <= b < e - 1.0:
                out.append((cur, max(cur + 0.05, b - 0.02)))
                cur = b - 0.02
        out.append((cur, e))
    return [(s, e) for s, e in out if e - s > 0.05]


# ---- 5) 음량 균일화 ---------------------------------------------------------------------------
def clip_gain_db(samples: np.ndarray, s: float, e: float, target_db: float = -20.0) -> float | None:
    """발화 프레임(상위 70%)의 RMS 기준 게인. 너무 짧으면 None(전역값 사용)."""
    if e - s < 1.0:
        return None
    a, b = int(s * SR), int(e * SR)
    x = samples[a:b]
    n = SR // 50
    k = len(x) // n
    if k < 10:
        return None
    rms = np.sqrt((x[: k * n].reshape(k, n) ** 2).mean(axis=1) + 1e-12)
    voiced = np.sort(rms)[int(k * 0.3):]
    return float(max(-6.0, min(6.0, target_db - 20 * np.log10(voiced.mean() + 1e-9))))


# ---- 6) 숏츠 후보 -----------------------------------------------------------------------------
def detect_highlights(tr: Transcript, samples: np.ndarray, keep: list[Interval], *, lo: float = 20.0, hi: float = 60.0,
                      top: int = 5) -> list[EditPoint]:
    segs = [s for s in tr.segments if s.words]
    if not segs:
        return []
    zs = dict(zip(map(id, segs), zscores([span_db(samples, s.start, s.end) for s in segs])))

    def kept_len(a: float, b: float) -> float:
        return sum(max(0.0, min(b, e) - max(a, s)) for s, e in keep)
    cands: list[EditPoint] = []
    for i, s0 in enumerate(segs):
        sc0, why0 = hook_score(s0, zs[id(s0)])
        if sc0 < 1.5 or not seg_in_keep(s0, keep):
            continue
        for j in range(i + 1, len(segs)):
            dur = kept_len(s0.start, segs[j].end)
            if dur > hi:
                break
            if dur < lo:
                continue
            nxt_gap = (segs[j + 1].start - segs[j].end) if j + 1 < len(segs) else 9.0
            closed = bool(re.search(r"(다|요|죠|니다|세요)[.!?]?\s*$", segs[j].text.strip())) and nxt_gap >= 0.6
            if not closed:
                continue
            nums = sum(1 for k in range(i, j + 1) if T.has_digit(segs[k].text))
            score = sc0 + 0.5 * nums + (0.5 if nxt_gap >= 1.5 else 0.0)
            cands.append(EditPoint(_key("highlight", s0.start), "highlight", s0.words[0].start, segs[j].words[-1].end,
                                   s0.text.strip()[:26], score, True,
                                   {"why": why0, "length": round(dur, 1), "title": s0.text.strip()}))
            break                                    # 시작 문장당 가장 짧은 완결 구간 1개
    chosen: list[EditPoint] = []
    for c in sorted(cands, key=lambda c: -c.score):
        if all(c.end <= x.start or c.start >= x.end for x in chosen):
            chosen.append(c)
        if len(chosen) >= top:
            break
    return sorted(chosen, key=lambda c: c.start)
