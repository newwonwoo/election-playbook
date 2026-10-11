"""pycapcut로 캡컷 드래프트 생성: Plan(점프컷·줌·음량·티저) + 자막 + 강조/챕터 오버레이. 저장 후 메타 보정."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pycapcut as cc

from . import media
from .plan import Plan

US = 1_000_000


def safe_name(stem: str) -> str:
    return re.sub(r"[^\w가-힣\-]+", "_", stem).strip("_")[:40] or "draft"


def _tr(start: float, dur: float) -> cc.Timerange:
    return cc.Timerange(int(round(start * US)), int(round(dur * US)))


def _pop_anim(seg: cc.TextSegment) -> None:
    """등장 애니메이션은 캡컷 버전에 따라 없을 수 있어 실패해도 드래프트는 유지."""
    try:
        seg.add_animation(cc.TextIntro.向上弹入, 300_000)
    except Exception:  # noqa: BLE001
        pass


def build(video, info: dict, plan: Plan, draft_root: Path, name: str, with_subs: bool = True) -> Path:
    draft_root.mkdir(parents=True, exist_ok=True)
    cw, ch = plan.canvas
    script = cc.DraftFolder(str(draft_root)).create_draft(name, cw, ch, info["fps"], allow_replace=True)
    script.add_track(cc.TrackType.video)
    srcs = media.as_sources(video, info)
    mats = {s.path: cc.VideoMaterial(s.path) for s in srcs}
    t = 0
    for c in plan.clips:
        for src, ls, le in media.split(srcs, c.src_s, c.src_e):          # 영상 경계를 넘는 클립은 파일별로 쪼갠다
            mat = mats[src.path]
            src_s = int(round(ls * US))
            dur = min(int(round((le - ls) * US)), mat.duration - src_s)    # 소스 길이 초과 방지
            if dur <= 0:
                continue
            sc = (media.cover_ratio(src, plan.canvas) if plan.cover else 1.0) * c.scale
            script.add_segment(cc.VideoSegment(
                mat, cc.Timerange(t, dur), source_timerange=cc.Timerange(src_s, dur), volume=c.volume,
                clip_settings=cc.ClipSettings(scale_x=sc, scale_y=sc) if abs(sc - 1.0) > 1e-3 else None))
            t += dur
    total_us = t
    portrait = ch > cw

    def clip_to_total(start: float, end: float):
        s = int(round(start * US))
        d = min(int(round((end - start) * US)), total_us - s)
        return (s, d) if d > 0 else None

    if with_subs and plan.subs:
        script.add_track(cc.TrackType.text, "subtitle")
        for sub in plan.subs:
            r = clip_to_total(sub.start, sub.end)
            if r:
                script.add_segment(cc.TextSegment(
                    sub.text, cc.Timerange(*r),
                    style=cc.TextStyle(size=plan.sub_size, color=(1.0, 1.0, 1.0), bold=True, align=1, auto_wrapping=True),
                    border=cc.TextBorder(color=(0.0, 0.0, 0.0), width=40.0),
                    clip_settings=cc.ClipSettings(transform_y=-0.55 if portrait else -0.78)), "subtitle")
    for kind, track in (("pop", "keyword"), ("chapter", "chapter")):
        ovs = [o for o in plan.overlays if o.kind == kind]
        if not ovs:
            continue
        script.add_track(cc.TrackType.text, track)
        last_end = 0
        for o in sorted(ovs, key=lambda o: o.start):
            r = clip_to_total(o.start, o.end)
            if not r or r[0] < last_end:              # 같은 트랙 겹침 방지
                continue
            last_end = r[0] + r[1]
            if kind == "pop":
                seg = cc.TextSegment(o.text, cc.Timerange(*r),
                                     style=cc.TextStyle(size=plan.sub_size * 1.7, color=(1.0, 0.9, 0.2), bold=True, align=1),
                                     border=cc.TextBorder(color=(0.0, 0.0, 0.0), width=50.0),
                                     clip_settings=cc.ClipSettings(transform_y=0.25 if portrait else 0.35))
                _pop_anim(seg)
            else:
                seg = cc.TextSegment(o.text, cc.Timerange(*r),
                                     style=cc.TextStyle(size=plan.sub_size * 0.9, color=(1.0, 1.0, 1.0), bold=True, align=1),
                                     background=cc.TextBackground(color="#000000", alpha=0.55, round_radius=0.3),
                                     clip_settings=cc.ClipSettings(transform_y=0.85 if portrait else 0.82))
            script.add_segment(seg, track)
    script.save()
    _patch_meta(draft_root / name, name, draft_root, total_us)
    return draft_root / name


def _patch_meta(path: Path, name: str, root: Path, total_us: int) -> None:
    """pycapcut은 tm_duration=0, draft_name=''로 저장 → 캡컷 프로젝트 목록에서 길이 0/이름 없음."""
    f = path / "draft_meta_info.json"
    meta = json.loads(f.read_text("utf-8"))
    meta.update({"tm_duration": total_us, "draft_name": name,
                 "draft_fold_path": str(path), "draft_root_path": str(root)})
    f.write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")
