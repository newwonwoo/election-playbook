"""자막 파일(.srt/.vtt)을 읽어 대본(Transcript)으로 바꾼다. 음성 인식(ASR)을 건너뛰는 용도.

자막 파일에는 단어별 시간이 없어서, 큐(cue) 안에서 '실제로 목소리가 들리는 구간'에 글자 수 비율로 시간을 나눠 준다."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .asr import Segment, Transcript, Word
from .cuts import Interval

_TIME = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")
_ARROW = re.compile(r"(\S+)\s*-->\s*(\S+)")
_TAG = re.compile(r"<[^>]+>|\{\\[^}]*\}")
EXTS = (".srt", ".vtt")


@dataclass
class Cue:
    start: float
    end: float
    text: str


def read_text(path: str | Path) -> str:
    """한국어 자막은 UTF-8(BOM 포함)뿐 아니라 CP949/EUC-KR도 흔하다."""
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-16"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _t(s: str) -> float | None:
    m = _TIME.fullmatch(s.strip())
    if not m:
        return None
    h, mi, sec, ms = m.groups()
    return int(h or 0) * 3600 + int(mi) * 60 + int(sec) + int(ms.ljust(3, "0")) / 1000


def parse(text: str) -> list[Cue]:
    """SRT/VTT 공통 파서. 깨진 블록은 건너뛴다."""
    cues: list[Cue] = []
    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n").replace("\r", "\n").strip()):
        lines = [l for l in block.split("\n") if l.strip()]
        for i, l in enumerate(lines):
            m = _ARROW.search(l)
            if not m:
                continue
            a, b = _t(m.group(1)), _t(m.group(2))
            if a is None or b is None or b <= a:
                break
            body = " ".join(_TAG.sub("", x).strip() for x in lines[i + 1:])
            body = re.sub(r"\s+", " ", body).strip()
            if body:
                cues.append(Cue(a, b, body))
            break
    return cues


def parse_file(path: str | Path) -> list[Cue]:
    return parse(read_text(path))


def _voiced_in(cue_s: float, cue_e: float, speech: list[Interval]) -> list[Interval]:
    out = [(max(cue_s, s), min(cue_e, e)) for s, e in speech if e > cue_s and s < cue_e]
    out = [(s, e) for s, e in out if e - s > 0.02]
    covered = sum(e - s for s, e in out)
    return out if covered >= 0.3 * (cue_e - cue_s) else [(cue_s, cue_e)]     # 목소리가 거의 안 잡히면 큐 전체


def _at(frac: float, spans: list[Interval]) -> float:
    """spans를 이어 붙인 가상 축에서 frac(0~1) 위치의 실제 시각."""
    tot = sum(e - s for s, e in spans)
    x = frac * tot
    for s, e in spans:
        if x <= e - s + 1e-9:
            return s + x
        x -= e - s
    return spans[-1][1]


def to_transcript(cues: list[Cue], speech: list[Interval], offset: float = 0.0) -> Transcript:
    """큐 → 세그먼트/단어. offset = 이 자막이 속한 영상의 전체 타임라인 시작 시각."""
    segs: list[Segment] = []
    for c in cues:
        s, e = c.start + offset, c.end + offset
        toks = c.text.split()
        if not toks:
            continue
        spans = _voiced_in(s, e, speech)
        weights = [max(1, len(re.sub(r"\W", "", t))) for t in toks]
        tot, acc, words = float(sum(weights)), 0.0, []
        for t, w in zip(toks, weights):
            a, b = acc / tot, (acc + w) / tot
            ws, we = _at(a, spans), _at(b, spans)
            words.append(Word(round(ws, 3), round(max(we - 0.02, ws + 0.02), 3), t))     # 단어 사이 미세한 틈
            acc += w
        segs.append(Segment(words[0].start, words[-1].end, c.text, words))
    return Transcript("ko", segs)


def pair(video_names: list[str], sub_names: list[str]) -> list[int | None]:
    """영상 i에 짝지을 자막 인덱스. 이름(확장자 뺀)이 같으면 짝, 하나도 안 맞고 개수가 같으면 순서대로."""
    def stem(n: str) -> str:
        return (n.rsplit(".", 1)[0] if "." in n else n).strip().lower()
    by_stem: dict[str, int] = {}
    for j, n in enumerate(sub_names):
        by_stem.setdefault(stem(n), j)
    res: list[int | None] = []
    used: set[int] = set()
    for n in video_names:
        j = by_stem.get(stem(n))
        if j is not None and j not in used:
            res.append(j)
            used.add(j)
        else:
            res.append(None)
    if all(r is None for r in res) and len(video_names) == len(sub_names):
        return list(range(len(video_names)))
    return res
