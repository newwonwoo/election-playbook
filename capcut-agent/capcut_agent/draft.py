"""pycapcut로 캡컷 드래프트 생성: 점프컷 비디오 + 자막. 저장 후 메타를 보정한다."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pycapcut as cc

from .cuts import Interval, timeline_offsets
from .subtitles import Sub

US = 1_000_000


def safe_name(stem: str) -> str:
    return re.sub(r"[^\w가-힣\-]+", "_", stem).strip("_")[:40] or "draft"


def build(video: str, info: dict, keep: list[Interval], subs: list[Sub],
          draft_root: Path, name: str, with_subs: bool = True) -> Path:
    draft_root.mkdir(parents=True, exist_ok=True)
    folder = cc.DraftFolder(str(draft_root))
    script = folder.create_draft(name, info["width"], info["height"], info["fps"], allow_replace=True)
    script.add_track(cc.TrackType.video)
    mat = cc.VideoMaterial(video)
    offs = timeline_offsets(keep)
    total_us = 0
    for (s, e), off in zip(keep, offs):
        src_s = int(round(s * US))
        dur = min(int(round((e - s) * US)), mat.duration - src_s)   # 소스 길이 초과 방지
        if dur <= 0:
            continue
        script.add_segment(cc.VideoSegment(
            mat, cc.Timerange(int(round(off * US)), dur), source_timerange=cc.Timerange(src_s, dur)))
        total_us = int(round(off * US)) + dur
    if with_subs and subs:
        script.add_track(cc.TrackType.text)
        size = 7.0 if info["width"] >= info["height"] else 9.0
        for sub in subs:
            s_us = int(round(sub.start * US))
            d_us = min(int(round((sub.end - sub.start) * US)), total_us - s_us)
            if d_us <= 0:
                continue
            script.add_segment(cc.TextSegment(
                sub.text, cc.Timerange(s_us, d_us),
                style=cc.TextStyle(size=size, color=(1.0, 1.0, 1.0), bold=True, align=1, auto_wrapping=True),
                border=cc.TextBorder(color=(0.0, 0.0, 0.0), width=40.0),
                clip_settings=cc.ClipSettings(transform_y=-0.78)))
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
