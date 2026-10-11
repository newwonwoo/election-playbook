"""ffmpeg 렌더러: Plan → 완성 mp4 (캡컷 불필요). 컷·줌·9:16 리프레임·음량·티저 + 자막/팝업/챕터 카드(ASS)."""
from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Callable

from .plan import Plan

MAX_INPUTS = 80          # 한 번의 ffmpeg 패스에서 여는 입력 수 상한(초과하면 청크 렌더 후 이어붙임)


class RenderCancelled(Exception):
    pass


def even(x: float) -> int:
    return max(2, int(round(x / 2)) * 2)


# ---- 폰트 -----------------------------------------------------------------------------------
_FONT_CANDIDATES = ["Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Noto Sans KR", "NanumGothic",
                    "Nanum Gothic", "WenQuanYi Zen Hei", "Noto Sans CJK JP"]


def pick_font() -> str:
    """한글이 되는 폰트. CAPCUT_FONT로 강제 지정 가능."""
    if os.environ.get("CAPCUT_FONT"):
        return os.environ["CAPCUT_FONT"]
    s = platform.system()
    if s == "Darwin":
        return "Apple SD Gothic Neo"
    if s == "Windows":
        return "Malgun Gothic"
    if shutil.which("fc-list"):
        out = subprocess.run(["fc-list", ":lang=ko", "family"], capture_output=True, text=True).stdout
        have = {f.strip() for line in out.splitlines() for f in line.split(",")}
        for c in _FONT_CANDIDATES:
            if c in have:
                return c
        if have:
            return sorted(have)[0]
    return "Noto Sans CJK KR"


# ---- ASS 자막 ---------------------------------------------------------------------------------
def _t(sec: float) -> str:
    cs = int(round(max(0.0, sec) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


def _esc(s: str) -> str:
    return s.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def build_ass(plan: Plan, font: str, canvas: tuple[int, int], with_subs: bool = True) -> str:
    cw, ch = canvas
    portrait = ch > cw
    sub_px = int(min(ch * 0.05 * plan.sub_size / 7, cw * 0.07))
    pop_px = int(sub_px * 1.7)
    chap_px = int(sub_px * 0.8)
    sub_mv = int(ch * (0.225 if portrait else 0.07))
    pop_y = int(ch * (0.30 if portrait else 0.28))
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {cw}
PlayResY: {ch}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{font},{sub_px},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,{max(2, sub_px // 14)},0,2,{int(cw * 0.05)},{int(cw * 0.05)},{sub_mv},1
Style: Pop,{font},{pop_px},&H0034E5FF,&H0034E5FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,{max(3, pop_px // 12)},0,5,20,20,0,1
Style: Chap,{font},{chap_px},&H00FFFFFF,&H00FFFFFF,&H99000000,&H99000000,1,0,0,0,100,100,0,0,3,{max(4, chap_px // 3)},0,8,20,20,{int(ch * 0.04)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    if with_subs:
        for s in plan.subs:
            lines.append(f"Dialogue: 0,{_t(s.start)},{_t(s.end)},Sub,,0,0,0,,{_esc(s.text)}")
    for o in plan.overlays:
        if o.kind == "pop":     # 작게 시작 → 커졌다 안정(튀어나오는 느낌) → 페이드아웃
            fx = (rf"{{\an5\pos({cw // 2},{pop_y})\fscx55\fscy55\t(0,140,\fscx115\fscy115)\t(140,240,\fscx100\fscy100)"
                  rf"\fad(0,150)}}")
            lines.append(f"Dialogue: 1,{_t(o.start)},{_t(o.end)},Pop,,0,0,0,,{fx}{_esc(o.text)}")
        elif o.kind == "chapter":
            lines.append(f"Dialogue: 2,{_t(o.start)},{_t(o.end)},Chap,,0,0,0,,{{\\fad(150,250)}}{_esc(o.text)}")
    return head + "\n".join(lines) + "\n"


# ---- 필터 그래프 ----------------------------------------------------------------------------
def clip_filters(info: dict, plan: Plan, canvas: tuple[int, int], c) -> tuple[str, str]:
    cw, ch = canvas
    w, h = info["width"], info["height"]
    k = min(cw / w, ch / h) * plan.base_scale * c.scale        # 맞춤 배율 × 리프레임 × 줌
    sw, sh = even(w * k), even(h * k)
    v = [f"scale={sw}:{sh}:flags=bicubic"]
    if sw > cw or sh > ch:
        v.append(f"crop={min(sw, cw)}:{min(sh, ch)}")
    if sw < cw or sh < ch:
        v.append(f"pad={cw}:{ch}:(ow-iw)/2:(oh-ih)/2:black")
    v += [f"fps={info['fps']}", "setsar=1", "format=yuv420p"]
    a = [f"volume={c.volume:.3f}", "aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo"]
    return ",".join(v), ",".join(a)


def _run(cmd: list[str], total: float, on_pct: Callable[[float], None], cancel: threading.Event, cwd: Path) -> None:
    p = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    err: list[str] = []
    t = threading.Thread(target=lambda: err.append(p.stderr.read()), daemon=True)
    t.start()
    for line in p.stdout:                                       # -progress pipe:1
        if cancel.is_set():
            p.kill()
            p.wait()
            raise RenderCancelled()
        m = re.match(r"out_time_(?:us|ms)=(\d+)", line)
        if m and total > 0:
            on_pct(min(1.0, int(m.group(1)) / 1e6 / total))
    p.wait()
    t.join(timeout=2)
    if cancel.is_set():
        raise RenderCancelled()
    if p.returncode != 0:
        raise RuntimeError("ffmpeg 렌더 실패: " + (err[0] if err else "")[-600:])


def _graph_pass(video: str, info: dict, plan: Plan, canvas, clips, work: Path, tag: str, ass: str | None, font_dir: str | None):
    inputs: list[str] = []
    chains: list[str] = []
    for i, c in enumerate(clips):
        inputs += ["-ss", f"{c.src_s:.3f}", "-t", f"{c.src_e - c.src_s:.3f}", "-i", video]
        vf, af = clip_filters(info, plan, canvas, c)
        chains.append(f"[{i}:v:0]{vf}[v{i}];[{i}:a:0]{af}[a{i}]")
    cat = "".join(f"[v{i}][a{i}]" for i in range(len(clips))) + f"concat=n={len(clips)}:v=1:a=1[vc][a]"
    if ass:
        fd = f":fontsdir={font_dir}" if font_dir else ""
        chains.append(f"{cat};[vc]ass={ass}{fd}[v]")
    else:
        chains.append(cat.replace("[vc]", "[v]"))
    script = work / f"graph_{tag}.txt"
    script.write_text(";\n".join(chains), "utf-8")
    return inputs, script


def render(video: str, info: dict, plan: Plan, out: Path, work: Path, *, on_progress: Callable[[float], None],
           cancel: threading.Event | None = None, with_subs: bool = True) -> Path:
    cancel = cancel or threading.Event()
    work.mkdir(parents=True, exist_ok=True)
    canvas = (even(plan.canvas[0]), even(plan.canvas[1]))
    font = pick_font()
    ass = work / "overlay.ass"
    ass.write_text(build_ass(plan, font, canvas, with_subs), "utf-8")
    use_ass = bool((with_subs and plan.subs) or plan.overlays)
    total = plan.out_duration
    clips = [c for c in plan.clips if c.src_e - c.src_s > 0.05]
    enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
    base = ["ffmpeg", "-y", "-v", "error", "-progress", "pipe:1", "-nostats"]
    out.parent.mkdir(parents=True, exist_ok=True)

    def single(cs, dest: Path, tag: str, final: bool, lo: float, hi: float):
        inputs, script = _graph_pass(video, info, plan, canvas, cs, work, tag, "overlay.ass" if (final and use_ass) else None, None)
        codec = enc if final else ["-c:v", "libx264", "-preset", "superfast", "-crf", "14", "-pix_fmt", "yuv420p",
                                   "-c:a", "pcm_s16le"]
        cmd = base + inputs + ["-filter_complex_script", script.name, "-map", "[v]", "-map", "[a]"] + codec + [str(dest)]
        dur = sum(c.src_e - c.src_s for c in cs)
        _run(cmd, dur, lambda f: on_progress(lo + (hi - lo) * f), cancel, work)

    if len(clips) <= MAX_INPUTS:
        single(clips, out, "all", True, 0.0, 1.0)
    else:                                                       # 긴 영상: 청크 → 이어붙이며 자막 입히기
        chunks = [clips[i:i + MAX_INPUTS] for i in range(0, len(clips), MAX_INPUTS)]
        parts = []
        for n, cs in enumerate(chunks):
            p = work / f"chunk_{n}.mkv"
            single(cs, p, f"c{n}", False, 0.85 * n / len(chunks), 0.85 * (n + 1) / len(chunks))
            parts.append(p)
        (work / "list.txt").write_text("".join(f"file '{p.name}'\n" for p in parts), "utf-8")
        vf = ["-vf", "ass=overlay.ass"] if use_ass else []
        cmd = base + ["-f", "concat", "-safe", "0", "-i", "list.txt"] + vf + enc + [str(out)]
        _run(cmd, total, lambda f: on_progress(0.85 + 0.15 * f), cancel, work)
        for p in parts:
            p.unlink(missing_ok=True)
    on_progress(1.0)
    return out
