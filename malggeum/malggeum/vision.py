"""Clef-omni로 영상 구간을 보고 판단: 얼굴 위치(스마트 리프레임) · 화면 품질 · 더듬음 · 단독 이해 가능 여부 등.

Clef-omni는 '판단'만 한다. 이 결과는 (1) 9:16 크롭/줌의 중심, (2) 'AI 제안 컷', (3) 훅·숏츠 후보 점수 가산에 쓰인다.
확률의 보정(calibration)이 검증되지 않았으므로 AI 제안 컷은 기본적으로 꺼진 상태로 제안만 한다."""
from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

from . import clef, clips, media

POS_CENTER = {"far_left": 0.10, "left": 0.30, "center": 0.50, "right": 0.70, "far_right": 0.90}
STATE = "A short video clip from a talking-head or presentation video. Judge only what is seen and heard in the clip."

QUESTIONS: dict[str, dict] = {
    "face": clef.noul("Is a person's face clearly visible in the frame?"),
    "face_pos": clef.choice("Where is the main person's face horizontally in the frame?", {
        "far_left": "at the far left edge of the frame", "left": "in the left part of the frame", "center": "in the middle of the frame",
        "right": "in the right part of the frame", "far_right": "at the far right edge of the frame", "none": "no person is visible"}),
    "slides": clef.noul("Is a slide, chart, document or screen recording the main visual content?"),
    "shaky": clef.score("How shaky or blurry is the footage?", ["stable and sharp", "slightly shaky or soft", "very shaky or blurry"]),
    "dark": clef.noul("Is the image so dark or overexposed that the subject is hard to see?"),
    "speaking": clef.noul("Is someone speaking clearly in this clip?"),
    "hesitate": clef.noul("Does the speaker stumble, restart sentences or hesitate a lot?"),
    "energy": clef.score("How energetic and engaging is the speaker?", ["flat and monotone", "moderate", "energetic and engaging"]),
    "selfc": clef.noul("Could a viewer understand this clip on its own as a complete short explanation?"),
    "hook": clef.noul("Would this clip grab a viewer's attention as the opening of a video?"),
    "noise": clef.noul("Is there loud background noise or music that makes the speech hard to hear?"),
}
THRESH = {"shaky": 1.5, "dark": 0.85, "hesitate": 0.85, "noise": 0.9}
REASON = {"shaky": "흔들림·흐림", "dark": "너무 어둡거나 밝음", "hesitate": "더듬거림", "noise": "소음"}
WIN = 8.0


class Cancelled(Exception):
    pass


def _p(a: dict | None) -> float | None:
    return None if not a else a.get("p")


def derive(ans: dict[str, dict]) -> dict:
    """원시 답 → 구간 지표. 못 받은 답은 None."""
    d = {k: _p(ans.get(k)) for k in ("face", "slides", "dark", "speaking", "hesitate", "selfc", "hook", "noise")}
    d["shaky"] = ans["shaky"]["score"] if "shaky" in ans else None
    d["energy"] = ans["energy"]["score"] if "energy" in ans else None
    fp = ans.get("face_pos")
    d["focus"] = None
    if fp and d["face"] is not None and d["face"] >= 0.5 and fp["probs"].get("none", 0) < 0.5:
        w = {k: v for k, v in fp["probs"].items() if k in POS_CENTER}
        tot = sum(w.values())
        if tot > 0:
            d["focus"] = round(sum(POS_CENTER[k] * v for k, v in w.items()) / tot, 3)     # 확률 가중 평균 위치(0~1)
    return d


def estimate(sources: list[media.Src]) -> dict:
    ws = clips.windows(sources, WIN)
    secs = sum(b - a for a, b in ws)
    tokens = sum(clef.estimate_tokens(b - a, len(QUESTIONS)) for a, b in ws)
    return {"windows": len(ws), "seconds": round(secs, 1), "tokens": tokens, "cost_usd": round(clef.estimate_cost(tokens), 4),
            "sends": "영상을 8초 단위(480p, 소리 포함)로 잘라 Cloudflare Workers AI(Clef-omni)로 전송합니다"}


def analyze(sources: list[media.Src], client: clef.ClefClient, *, progress: Callable[[float], None] | None = None,
            cancel: threading.Event | None = None, workers: int = 4) -> dict:
    ws = clips.windows(sources, WIN)
    results: list[dict | None] = [None] * len(ws)
    done = [0]
    lock = threading.Lock()
    err: list[Exception] = []

    def one(i: int) -> None:
        if (cancel and cancel.is_set()) or err:
            return
        a, b = ws[i]
        src = clips.locate(sources, a)
        try:
            data = clips.cut_clip(src.path, a - src.offset, min(b, src.end) - src.offset)
            ans = client.ask(STATE, QUESTIONS, [(data, b - a)], media_key=clef.media_hash(data))
        except clef.ClefError as e:
            err.append(e)
            return
        results[i] = {"start": round(a, 3), "end": round(b, 3), **derive(ans)}
        with lock:
            done[0] += 1
            if progress:
                progress(done[0] / len(ws))

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(one, range(len(ws))))
    if err:
        raise err[0]
    if cancel and cancel.is_set():
        raise Cancelled()
    wins = [r for r in results if r]
    return {"version": 1, "windows": wins, "model": clef.MODEL, "input_tokens": client.input_tokens,
            "cost_usd": round(client.cost_so_far(), 4), "requests": client.requests}


# ---- 결과 활용 --------------------------------------------------------------------------------
def _overlap(w: dict, s: float, e: float) -> float:
    return max(0.0, min(w["end"], e) - max(w["start"], s))


def focus_at(vision: dict | None, t0: float, t1: float) -> float | None:
    """구간 [t0,t1]과 가장 많이 겹치는 분석 구간의 얼굴 위치(0~1). 양쪽 이웃이 모두 있을 때만 3개의 중앙값으로 한 구간짜리 튐을 누른다.
    가장자리에서는 자기 값 그대로(이웃과 섞으면 실제 이동이 뭉개진다). 얼굴을 못 찾으면 None(중앙)."""
    if not vision:
        return None
    ws = vision["windows"]
    best = max(range(len(ws)), key=lambda i: _overlap(ws[i], t0, t1), default=None)
    if best is None or _overlap(ws[best], t0, t1) <= 0:
        return None
    f = ws[best]["focus"]
    if f is None:
        return None

    prev = ws[best - 1]["focus"] if best > 0 and abs(ws[best]["start"] - ws[best - 1]["end"]) < 0.5 else None
    nxt = ws[best + 1]["focus"] if best + 1 < len(ws) and abs(ws[best + 1]["start"] - ws[best]["end"]) < 0.5 else None
    return sorted([prev, f, nxt])[1] if (prev is not None and nxt is not None) else f


def mean_over(vision: dict | None, key: str, s: float, e: float) -> float | None:
    if not vision:
        return None
    num = den = 0.0
    for w in vision["windows"]:
        o = _overlap(w, s, e)
        if o > 0 and w.get(key) is not None:
            num += o * w[key]
            den += o
    return num / den if den else None


def suggest_cuts(vision: dict) -> list[tuple[float, float, str]]:
    """나쁜 구간 제안: 같은 이유가 이어지면 합친다. (시작, 끝, 라벨)"""
    out: list[list] = []
    for w in vision["windows"]:
        for key, th in THRESH.items():
            v = w.get(key)
            if v is not None and v >= th:
                if out and out[-1][2] == key and abs(out[-1][1] - w["start"]) < 0.01:
                    out[-1][1] = w["end"]
                else:
                    out.append([w["start"], w["end"], key])
    return [(a, b, f"AI: {REASON[k]}") for a, b, k in out]


def source_scores(vision: dict, sources: list[media.Src]) -> list[dict]:
    """영상별 종합 점수(0~100)와 지표. 여러 영상 중 무엇이 쓸 만한지 비교하는 용도."""
    res = []
    for s in sources:
        ws = [w for w in vision["windows"] if s.offset <= w["start"] < s.end]

        def m(k, default):
            v = [w[k] for w in ws if w.get(k) is not None]
            return sum(v) / len(v) if v else default
        face, energy, shaky, dark, hes, selfc = m("face", 0.5), m("energy", 1.0) / 2, m("shaky", 0.0) / 2, m("dark", 0.0), m("hesitate", 0.0), m("selfc", 0.5)
        sc = 100 * (0.25 * face + 0.25 * energy + 0.2 * (1 - shaky) + 0.1 * (1 - dark) + 0.1 * (1 - hes) + 0.1 * selfc)
        res.append({"name": s.name, "score": round(sc), "face": round(face, 2), "energy": round(energy * 2, 2), "shaky": round(shaky * 2, 2),
                    "dark": round(dark, 2), "hesitate": round(hes, 2), "windows": len(ws)})
    return res


def public(vision: dict | None, sources: list[media.Src]) -> dict | None:
    if not vision:
        return None
    if vision.get("error"):
        return {"error": vision["error"]}
    return {"windows": len(vision["windows"]), "cost_usd": vision.get("cost_usd", 0), "input_tokens": vision.get("input_tokens", 0),
            "reframe": any(w["focus"] is not None for w in vision["windows"]),
            "focus": [{"s": w["start"], "e": w["end"], "x": w["focus"]} for w in vision["windows"]],
            "suggestions": [{"start": a, "end": b, "label": l} for a, b, l in suggest_cuts(vision)],
            "sources": source_scores(vision, sources)}


def split_by_focus(clips: list, vision: dict | None, tol: float = 0.08) -> list:
    """한 클립이 여러 분석 구간에 걸치고 얼굴 위치가 tol 넘게 바뀌면 그 경계에서 클립을 나눈다(소스는 이어져 있어 이음새는 없고 프레이밍만 바뀜)."""
    from dataclasses import replace
    if not vision:
        return clips
    out = []
    for c in clips:
        ws = [w for w in vision["windows"] if w["end"] > c.src_s + 1e-6 and w["start"] < c.src_e - 1e-6]
        if not ws:
            out.append(c)
            continue
        cur_s, cur_f = c.src_s, focus_at(vision, c.src_s, min(c.src_e, ws[0]["end"]))
        for w in ws[1:]:
            f = focus_at(vision, max(w["start"], c.src_s), min(w["end"], c.src_e))
            differs = (f is None) != (cur_f is None) or (f is not None and abs(f - cur_f) > tol)
            if differs and w["start"] - cur_s > 0.5 and c.src_e - w["start"] > 0.5:
                out.append(replace(c, src_s=cur_s, src_e=w["start"], focus=cur_f))
                cur_s, cur_f = w["start"], f
        out.append(replace(c, src_s=cur_s, focus=cur_f))
    return out
