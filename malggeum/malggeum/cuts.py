"""구간(interval) 연산과 컷 → keep 계산. 순수 함수만 둔다(테스트 용이)."""
from __future__ import annotations

from dataclasses import dataclass, asdict

Interval = tuple[float, float]


@dataclass
class Cut:
    id: int
    kind: str          # silence | filler | ng
    start: float
    end: float
    label: str = ""
    enabled: bool = True

    def to_dict(self) -> dict:
        d = asdict(self)
        d["start"], d["end"] = round(self.start, 3), round(self.end, 3)
        return d


def merge(intervals: list[Interval], gap: float = 0.0) -> list[Interval]:
    out: list[Interval] = []
    for s, e in sorted(i for i in intervals if i[1] > i[0]):
        if out and s <= out[-1][1] + gap:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def subtract(base: list[Interval], holes: list[Interval]) -> list[Interval]:
    """base - holes (둘 다 임의 순서 허용)."""
    result: list[Interval] = []
    holes = merge(holes)
    for s, e in merge(base):
        cur = s
        for hs, he in holes:
            if he <= cur or hs >= e:
                continue
            if hs > cur:
                result.append((cur, hs))
            cur = max(cur, he)
        if cur < e:
            result.append((cur, e))
    return result


def compute_keep(duration: float, cuts: list[Cut], keep_marks: list[Interval] | None = None,
                 min_keep: float = 0.35) -> list[Interval]:
    """활성 컷을 전체에서 빼고, 사용자 보존 구간을 되살린 뒤 너무 짧은 조각을 버린다."""
    active = [(c.start, c.end) for c in cuts if c.enabled]
    keep = subtract([(0.0, duration)], active)
    if keep_marks:
        keep = merge(keep + [(max(0.0, s), min(duration, e)) for s, e in keep_marks])
    return [(s, e) for s, e in keep if e - s >= min_keep]


def timeline_offsets(keep: list[Interval]) -> list[float]:
    """각 keep 구간이 출력 타임라인에서 시작하는 시각."""
    offs, acc = [], 0.0
    for s, e in keep:
        offs.append(acc)
        acc += e - s
    return offs


def remap(t: float, keep: list[Interval]) -> float | None:
    """원본 시각 → 출력 시각. keep 밖이면 None."""
    acc = 0.0
    for s, e in keep:
        if s <= t <= e:
            return acc + (t - s)
        acc += e - s
    return None


def total(keep: list[Interval]) -> float:
    return sum(e - s for s, e in keep)


def remap_clamp(t: float, keep: list[Interval]) -> float:
    """keep 밖의 시각은 가장 가까운 다음 keep 경계로 붙인다(자막 경계용)."""
    acc = 0.0
    for s, e in keep:
        if t < s:
            return acc
        if t <= e:
            return acc + (t - s)
        acc += e - s
    return acc
