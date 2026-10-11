"""편집 계획(Plan): 컷 결과(keep) + 편집 포인트 → 출력 타임라인의 클립/자막/오버레이."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import media, points as P, subtitles, vision as V
from .asr import Transcript
from .cuts import Interval, remap_clamp
from .subtitles import Sub


@dataclass
class Clip:
    src_s: float
    src_e: float
    scale: float = 1.0          # 줌(배율). 캔버스 리프레임 배율은 Plan.base_scale에서 곱한다
    volume: float = 1.0
    kind: str = "main"          # main | teaser
    focus: float | None = None  # 얼굴의 가로 위치(0~1). 있으면 크롭·줌의 중심으로 쓴다(스마트 리프레임)


@dataclass
class Overlay:
    start: float                # 출력 타임라인(초)
    end: float
    text: str
    kind: str                   # pop | chapter


@dataclass
class Plan:
    clips: list[Clip]
    subs: list[Sub]
    overlays: list[Overlay]
    points: list[P.EditPoint]
    canvas: tuple[int, int]
    base_scale: float
    teaser_len: float
    out_duration: float
    chapters_text: str = ""
    sub_size: float = 7.0
    workflow: str = "longform"
    preview: dict = field(default_factory=dict)
    cover: bool = False            # True면 영상을 캔버스에 꽉 채움(9:16 숏폼), False면 맞춤(fit)
    enhance: bool = False          # 음질 보정(노이즈 제거 + 라우드니스 표준화) — 렌더 mp4에만 적용


def parse_glossary(text: str) -> tuple[dict[str, str], set[str]]:
    """한 줄에 `틀린표기=맞는표기` (교정) 또는 `용어` (강조어)."""
    fixes: dict[str, str] = {}
    terms: set[str] = set()
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            a, b = (x.strip() for x in line.split("=", 1))
            if a:
                fixes[a] = b
                terms.add(b)
        else:
            terms.add(line)
    return fixes, terms


def _ts(t: float) -> str:
    t = int(round(t))
    return f"{t // 3600}:{t // 60 % 60:02}:{t % 60:02}" if t >= 3600 else f"{t // 60}:{t % 60:02}"


def canvas_for(preset: dict, info: dict) -> tuple[tuple[int, int], float, bool]:
    """(캔버스, 첫 영상 기준 꽉 채움 배율, cover 여부). 숏폼은 항상 1080×1920에 꽉 채운다(영상마다 비율이 달라도 동일)."""
    w, h = info["width"], info["height"]
    if preset["canvas"] == "9:16":
        cw, ch = 1080, 1920
        a, b = cw / w, ch / h
        return (cw, ch), max(a, b) / min(a, b), True
    return (w, h), 1.0, False


def build(tr: Transcript, samples: np.ndarray, keep: list[Interval], info: dict, *, workflow: str,
          features: dict | None = None, off: set[str] | None = None, glossary: str = "",
          sources: list | None = None, vision: dict | None = None) -> Plan:
    preset = P.PRESETS[workflow]
    f = {**preset["features"], **(features or {})}
    off = off or set()
    fixes, terms = parse_glossary(glossary)
    pts: list[P.EditPoint] = []

    emph = P.detect_emphasis(tr, samples, keep, min_gap=preset["emphasis_gap"], per_min=preset["emphasis_per_min"],
                             extra_terms=terms) if f.get("emphasis") else []
    hook_bonus = (lambda s, e: 1.5 * (V.mean_over(vision, "hook", s, e) or 0.0)) if vision else None      # AI가 '시작으로 좋다'고 본 만큼 가산
    hook = P.detect_hook(tr, samples, keep, bonus=hook_bonus) if f.get("hook") else []
    if f.get("chapters") and sources and len(sources) > 1:      # 여러 영상을 이어붙였으면 영상 하나 = 챕터 하나(파일 이름이 제목)
        chapters = [P.EditPoint(P._key("chapter", s.offset), "chapter", s.offset, s.end, f"{i:02d} {s.stem[:24]}", 0.0, True,
                                {"title": s.stem[:24], "why": "영상 경계", "index": i}) for i, s in enumerate(sources, 1)]
    else:
        chapters = P.detect_chapters(tr, keep, min_len=preset["min_chapter"]) if f.get("chapters") and preset["min_chapter"] else []

    # 줌: 문장 경계 분할 → 100% / zoom 교차
    pieces = P.split_for_zoom(keep, tr, preset["zoom_every"]) if f.get("zoom") else list(keep)
    clips = [Clip(s, e) for s, e in pieces]
    if f.get("zoom"):
        for i, c in enumerate(clips):
            if i % 2 == 1:
                pt = P.EditPoint(P._key("zoom", c.src_s), "zoom", c.src_s, c.src_e,
                                 f"{preset['zoom_scale'] * 100:.0f}%", 0.0, True, {"scale": preset["zoom_scale"]})
                pts.append(pt)
                c.scale = preset["zoom_scale"] if pt.key not in off else 1.0
    # 음량 균일화
    if f.get("loudness"):
        gains = [P.clip_gain_db(samples, c.src_s, c.src_e) for c in clips]
        valid = [g for g in gains if g is not None]
        fallback = float(np.median(valid)) if valid else 0.0
        for c, g in zip(clips, gains):
            g = fallback if g is None else g
            key = P._key("loudness", c.src_s)
            if abs(g) >= 1.5:
                pt = P.EditPoint(key, "loudness", c.src_s, c.src_e, f"{g:+.1f}dB", abs(g), True, {"gain_db": g})
                pts.append(pt)
                if key not in off:
                    c.volume = float(min(2.0, max(0.5, 10 ** (g / 20))))
    clips = V.split_by_focus(clips, vision)                    # 얼굴이 움직이면 그 경계에서 프레이밍을 바꾼다
    # 훅 티저
    teaser = 0.0
    for h in hook:
        h.enabled = h.key not in off
    if hook and hook[0].enabled:
        h = hook[0]
        host = next((iv for iv in keep if iv[0] - 0.01 <= h.start <= iv[1]), None)
        if host:
            a, b = max(host[0], h.start - 0.05), min(host[1], h.end + 0.15)
            clips.insert(0, Clip(a, b, preset["zoom_scale"] if f.get("zoom") else 1.0, 1.0, "teaser"))
            teaser = b - a
    if vision:                                                   # 티저 클립에도 얼굴 위치를 붙인다(본편 클립은 위에서 이미 붙음)
        for c in clips:
            if c.kind == "teaser":
                c.focus = V.focus_at(vision, c.src_s, c.src_e)
    main_len = sum(c.src_e - c.src_s for c in clips if c.kind == "main")
    out_total = teaser + main_len

    # 자막 (티저 + 본편)
    sc = preset["sub_chars"]
    subs: list[Sub] = []
    if teaser:
        tc = clips[0]
        subs += subtitles.build(tr, [(tc.src_s, tc.src_e)], sc, fixes)
    subs += [Sub(s.start + teaser, s.end + teaser, s.text) for s in subtitles.build(tr, keep, sc, fixes)]
    subs.sort(key=lambda s: s.start)
    for a, b in zip(subs, subs[1:]):
        if a.end > b.start or b.start - a.end < 0.35:     # 겹침 제거 + 짧은 틈은 이어 붙여 자막 깜빡임 방지
            a.end = b.start
    subs = [s for s in subs if s.end - s.start > 0.05]

    # 오버레이: 강조 팝업 + 챕터 카드
    overlays: list[Overlay] = []
    for e in emph:
        e.enabled = e.key not in off
        if e.enabled:
            t = remap_clamp(e.start, keep) + teaser
            overlays.append(Overlay(t, min(out_total, t + min(1.4, max(0.8, e.end - e.start + 0.5))), e.data["text"], "pop"))
    chap_lines = []
    for c in chapters:
        c.enabled = c.key not in off
        t = remap_clamp(c.start, keep) + teaser
        if c.enabled:
            overlays.append(Overlay(t, min(out_total, t + 2.5), c.label, "chapter"))
            chap_lines.append((0.0 if c.data["index"] == 1 else t, c.data["title"]))
    chapters_text = "\n".join(f"{_ts(t)} {title}" for t, title in chap_lines) if len(chap_lines) >= 3 else ""
    overlays = [o for o in overlays if o.end - o.start > 0.1]

    pts += hook + emph + chapters
    pts.sort(key=lambda p: (p.start, p.kind))
    (cw, ch), base, cover = canvas_for(preset, info)
    prev = {
        "zoom": [{"s": round(c.src_s, 3), "e": round(c.src_e, 3), "scale": round(c.scale, 3)} for c in clips if c.kind == "main"],
        "pops": [{"s": round(e.start, 3), "e": round(e.start + 1.1, 3), "text": e.data["text"]} for e in emph if e.enabled],   # 원본 시각(프리뷰는 원본 재생)
        "chapters": [{"s": round(c.start, 3), "title": c.label} for c in chapters if c.enabled],
    }
    return Plan(clips, subs, overlays, pts, (cw, ch), base, teaser, out_total, chapters_text, preset["sub_size"], workflow, prev,
                cover=cover, enhance=bool(f.get("enhance")))
