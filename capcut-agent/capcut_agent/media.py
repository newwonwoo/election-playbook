"""여러 영상을 이어붙인 '가상 전체 타임라인' ↔ 원본 파일별 구간 매핑. 분석은 전체 타임라인, 렌더/드래프트는 파일별."""
from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass
class Src:
    name: str                  # 표시용 원본 파일명
    path: str
    offset: float = 0.0        # 전체 타임라인에서 이 영상이 시작하는 시각(초)
    duration: float = 0.0
    width: int = 0
    height: int = 0
    fps: int = 30
    sub: str | None = None     # 함께 올린 자막 파일(.srt/.vtt) 경로

    @property
    def end(self) -> float:
        return self.offset + self.duration

    @property
    def stem(self) -> str:
        n = self.name.rsplit(".", 1)[0] if "." in self.name else self.name
        return n

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Src":
        return cls(**d)


def single(path: str, info: dict, name: str | None = None) -> list[Src]:
    return [Src(name or str(path).rsplit("/", 1)[-1], str(path), 0.0, info["duration"], info["width"], info["height"], info["fps"])]


def as_sources(video, info: dict) -> list[Src]:
    """str(경로) 또는 Src 리스트를 받아 항상 Src 리스트로."""
    return video if isinstance(video, list) else single(str(video), info)


def total(sources: list[Src]) -> float:
    return sum(s.duration for s in sources)


def layout(sources: list[Src]) -> None:
    """duration이 채워진 뒤 offset을 누적해서 부여."""
    acc = 0.0
    for s in sources:
        s.offset = acc
        acc += s.duration


def split(sources: list[Src], s: float, e: float) -> list[tuple[Src, float, float]]:
    """전체 타임라인 구간 [s,e)를 원본 파일별 (src, 로컬 시작, 로컬 끝)으로 쪼갠다. 파일 경계를 넘으면 여러 조각."""
    out = []
    for src in sources:
        a, b = max(s, src.offset), min(e, src.end)
        if b - a > 1e-6:
            out.append((src, a - src.offset, b - src.offset))
    return out


def boundaries(sources: list[Src]) -> list[float]:
    """영상 사이 경계 시각(첫 영상의 시작 제외)."""
    return [s.offset for s in sources[1:]]


def scale_k(src: Src, canvas: tuple[int, int], cover: bool) -> float:
    """원본을 캔버스에 '맞춤(fit)' 또는 '꽉 채움(cover)'으로 놓을 때의 배율."""
    cw, ch = canvas
    a, b = cw / src.width, ch / src.height
    return max(a, b) if cover else min(a, b)


def cover_ratio(src: Src, canvas: tuple[int, int]) -> float:
    """캡컷 클립 scale(1.0 = fit) 기준으로 cover가 되려면 곱해야 할 배율."""
    return scale_k(src, canvas, True) / scale_k(src, canvas, False)


def focus_shift(src: Src, canvas: tuple[int, int], cover: bool, scale: float, focus: float | None) -> tuple[float, float]:
    """(표시 폭, 얼굴을 가운데로 옮기는 이동량(px, +=이미지를 오른쪽으로)). 화면 밖이 드러나지 않게 제한한다."""
    cw = canvas[0]
    disp_w = scale_k(src, canvas, cover) * src.width * scale
    if focus is None or disp_w <= cw + 1:
        return disp_w, 0.0
    limit = (disp_w - cw) / 2
    return disp_w, max(-limit, min(limit, (0.5 - focus) * disp_w))
