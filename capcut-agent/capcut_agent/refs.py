"""레퍼런스(참고) 영상 라이브러리: 내가 모아 둔 잘 만든 영상의 '편집 스타일'을 수치로 읽어 둔다.

- 직접 측정(ffmpeg): 컷 속도(분당 장면 전환), 무음 비율, 화면 비율, 길이.
- Clef-omni(선택): 큰 자막·키워드 팝업·줌·B-roll 등 화면 요소가 얼마나 자주 나오는지(구간별 확률의 평균).
Clef-omni는 인터넷을 검색하지 못한다. 그래서 '레퍼 찾기'는 사용자가 넣어 둔 영상 안에서 한다."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Callable

from . import audio, clef, clips, media

SAMPLES = 6                       # 레퍼 하나당 Clef-omni에 보여 줄 구간 수
SCENE_THRESHOLD = 0.15

STYLE_Q = {
    "caps": clef.noul("Are large burned-in subtitles or captions shown on the screen?"),
    "popup": clef.noul("Is a keyword or number highlighted as large pop-up text, for example in yellow or another bright color?"),
    "zoom": clef.noul("Does the picture zoom in or punch in on the speaker?"),
    "closeup": clef.noul("Is the speaker's face shown large in the frame, close to the camera?"),
    "broll": clef.noul("Is B-roll footage, stock video or images shown instead of the speaker?"),
    "emoji": clef.noul("Are emoji or stickers shown on the screen?"),
    "slides": clef.noul("Are slides, charts or screen recordings the main visual content?"),
    "music": clef.noul("Is background music playing under the speech?"),
    "pace": clef.score("How fast is the editing pace?", ["slow", "moderate", "fast", "very fast"]),
}
HOOK_Q = {"hook": clef.noul("Does the opening of this video preview or tease its most interesting point?")}


def aspect_of(w: int, h: int) -> str:
    r = w / h if h else 1
    return "9:16" if r < 0.7 else ("1:1" if r < 1.2 else "16:9")


def count_scene_cuts(path: str, threshold: float = SCENE_THRESHOLD) -> int:
    """장면 전환 수(점프컷·화면 전환 포함). 느린 작은 해상도로 한 번 훑는다."""
    p = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-an", "-vf", f"scale=320:-2,select='gt(scene,{threshold})',showinfo",
                        "-f", "null", "-"], capture_output=True, text=True)
    return len(re.findall(r"pts_time:", p.stderr))


def silence_ratio(path: str, min_silence: float = 0.25) -> tuple[float, float]:
    """(무음 비율, 발화 비율). 짧은 숨쉬기(min_silence 미만)는 발화로 친다."""
    x = audio.load_pcm(path)
    spans, _ = audio.detect_speech(x, min_silence=min_silence)
    dur = len(x) / audio.SR or 1.0
    voiced = sum(e - s for s, e in spans) / dur
    return round(max(0.0, 1 - voiced), 3), round(min(1.0, voiced), 3)


class RefStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def _dir(self, rid: str) -> Path:
        return self.root / rid

    def _write(self, rid: str, d: dict) -> None:
        tmp = self._dir(rid) / "ref.json.tmp"
        tmp.write_text(json.dumps(d, ensure_ascii=False), "utf-8")
        tmp.replace(self._dir(rid) / "ref.json")

    def get(self, rid: str) -> dict | None:
        try:
            return json.loads((self._dir(rid) / "ref.json").read_text("utf-8"))
        except (OSError, ValueError):
            return None

    def list(self) -> list[dict]:
        out = [self.get(p.name) for p in sorted(self.root.iterdir()) if p.is_dir()]
        return sorted([r for r in out if r], key=lambda r: -r["added"])

    def video_path(self, rid: str) -> Path:
        return self._dir(rid) / "video.mp4"

    def create(self, name: str) -> tuple[str, Path]:
        rid = uuid.uuid4().hex[:8]
        self._dir(rid).mkdir(parents=True)
        self._write(rid, {"id": rid, "name": name, "added": time.time(), "status": "new", "error": None})
        return rid, self.video_path(rid)

    def delete(self, rid: str) -> bool:
        if not self._dir(rid).exists():
            return False
        shutil.rmtree(self._dir(rid), ignore_errors=True)
        return True

    def index(self, rid: str, client: clef.ClefClient | None = None, progress: Callable[[float], None] | None = None) -> dict:
        """직접 측정(항상) + Clef-omni 스타일 질문(client가 있을 때). 실패해도 가능한 값은 남긴다."""
        d = self.get(rid)
        path = str(self.video_path(rid))
        try:
            info = audio.probe(path)
            sil, voiced = silence_ratio(path)
            cuts = count_scene_cuts(path)
            dur = info["duration"]
            d.update(duration=round(dur, 1), width=info["width"], height=info["height"], fps=info["fps"],
                     aspect=aspect_of(info["width"], info["height"]),
                     metrics={"shots_per_min": round(cuts / dur * 60, 1) if dur else 0.0, "scene_cuts": cuts,
                              "silence_ratio": sil, "voiced_ratio": voiced},
                     status="indexed", error=None, clef=None)
            if progress:
                progress(0.3)
            if client is not None:
                d["clef"] = self._ask_style(path, dur, client, lambda f: progress and progress(0.3 + 0.7 * f))
        except clef.ClefError as e:                      # AI 쪽 실패: 직접 측정값은 유지
            d["error"] = f"AI 스타일 분석 실패: {e}"
        except Exception as e:  # noqa: BLE001
            d.update(status="error", error=f"{type(e).__name__}: {e}")
        self._write(rid, d)
        return d

    @staticmethod
    def sample_windows(dur: float) -> list[tuple[float, float]]:
        """영상 전체에서 고르게 퍼진 구간. 첫 구간은 항상 포함(훅 판단용)."""
        src = [media.Src("r", "", 0.0, dur)]
        ws = clips.windows(src, 8.0)
        if len(ws) <= SAMPLES:
            return ws
        step = (len(ws) - 1) / (SAMPLES - 1)
        return [ws[round(i * step)] for i in range(SAMPLES)]

    def _ask_style(self, path: str, dur: float, client: clef.ClefClient, progress: Callable[[float], None]) -> dict:
        ws = self.sample_windows(dur)
        acc: dict[str, list[float]] = {}
        hook = None
        for i, (a, b) in enumerate(ws):
            data = clips.cut_clip(path, a, b)
            qs = dict(STYLE_Q, **(HOOK_Q if i == 0 else {}))
            ans = client.ask("A short clip from a reference video whose editing style is being studied.", qs, [(data, b - a)],
                             media_key=clef.media_hash(data))
            for k, a_ in ans.items():
                if k == "hook":
                    hook = a_["p"]
                elif a_["type"] == "noul":
                    acc.setdefault(k, []).append(a_["p"])
                elif a_["type"] == "score":
                    acc.setdefault(k, []).append(a_["score"] / max(1, len(STYLE_Q[k]["criteria"]) - 1))      # 0~1로 정규화
            progress((i + 1) / len(ws))
        out = {k: round(sum(v) / len(v), 3) for k, v in acc.items()}
        if hook is not None:
            out["hook"] = round(hook, 3)
        return {"fractions": out, "samples": len(ws), "cost_usd": round(client.cost_so_far(), 4)}

    def query(self, rids: list[str], text: str, client: clef.ClefClient) -> list[dict]:
        """자유 질문(예: '큰 노란 자막이 있고 컷이 빠른 영상')이 각 레퍼에 얼마나 맞는지 Clef-omni로 판단. 요금이 든다(캐시됨)."""
        q = {"match": clef.noul(f"Does this video clip match this description: {text.strip()[:300]}")}
        res = []
        for rid in rids:
            d = self.get(rid)
            if not d or d.get("status") != "indexed":
                continue
            ps = []
            for a, b in self.sample_windows(d["duration"]):
                data = clips.cut_clip(str(self.video_path(rid)), a, b)
                ans = client.ask("A short clip from a reference video library.", q, [(data, b - a)], media_key=clef.media_hash(data))
                ps.append(ans["match"]["p"])
            res.append({"id": rid, "name": d["name"], "score": round(sum(ps) / len(ps), 3), "clips": len(ps)})
        return sorted(res, key=lambda r: -r["score"])


def similar(job_profile: dict, refs: list[dict]) -> list[dict]:
    """내 영상과 '형식'이 비슷한 레퍼 순위. 화면 비율·길이, (AI 분석이 있으면) 얼굴 클로즈업·슬라이드 비중을 비교한다."""
    out = []
    for r in refs:
        if r.get("status") != "indexed":
            continue
        reasons, score = [], 0.0
        if r["aspect"] == job_profile["aspect"]:
            score += 0.4
            reasons.append(f"화면 비율 같음 ({r['aspect']})")
        ratio = min(r["duration"], job_profile["duration"]) / max(r["duration"], job_profile["duration"], 1)
        score += 0.2 * ratio
        if ratio > 0.5:
            reasons.append("길이가 비슷함")
        fr = (r.get("clef") or {}).get("fractions") or {}
        for key, mine, label in (("closeup", job_profile.get("face"), "얼굴 클로즈업 비중"), ("slides", job_profile.get("slides"), "슬라이드·자료 화면 비중")):
            if mine is not None and key in fr:
                s = 1 - abs(mine - fr[key])
                score += 0.2 * s
                if s > 0.75:
                    reasons.append(f"{label} 비슷함")
        out.append({"id": r["id"], "name": r["name"], "score": round(score, 3), "reasons": reasons, "aspect": r["aspect"],
                    "shots_per_min": r["metrics"]["shots_per_min"]})
    return sorted(out, key=lambda x: -x["score"])
