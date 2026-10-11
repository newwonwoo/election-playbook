"""Cloudflare Clef-omni 클라이언트 (공식 입출력 스키마 기준).

- 요청: model/state/questions/videos. 영상은 base64 데이터 URL, 요청당 최대 2개·개당 16MiB·60초.
- 질문 유형: noul(예/아니오 확률) / choice(선택) / score(단계 점수). 요청당 질문 64개 이하.
- 같은 영상 조각 + 같은 질문은 로컬 캐시에서 재사용 → 다시 과금되지 않고, 중단 후 이어서 가능.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

MODEL = "clef-omni"
MAX_QUESTIONS = 64
MAX_VIDEOS = 2
MAX_VIDEO_BYTES = 16 << 20
MAX_VIDEO_SEC = 60.0
PRICE_PER_TOKEN = 0.15 / 1_000_000                    # 입력 토큰 100만 개당 $0.15 (출력 무료)
UA = "capcut-agent/0.6 (local video editing tool)"     # 파이썬 기본 UA는 Cloudflare 봇 차단(오류 1010)에 걸린다
_ID = re.compile(r"^[A-Za-z0-9_.\-]{1,100}$")
RETRY_STATUS = {429, 500, 502, 503, 504}


class ClefError(Exception):
    pass


class ClefAuthError(ClefError):
    pass


class ClefRequestError(ClefError):
    pass


# ---- 질문 만들기 ------------------------------------------------------------------------------
def noul(instructions: str) -> dict:
    return {"type": "noul", "instructions": instructions}


def choice(instructions: str, options: dict[str, str]) -> dict:
    return {"type": "choice", "instructions": instructions, "criteria": options}


def score(instructions: str, levels: list[str]) -> dict:
    return {"type": "score", "instructions": instructions, "criteria": levels}


def validate_questions(qs: dict) -> None:
    if not qs:
        raise ClefRequestError("질문이 없습니다")
    for k, q in qs.items():
        if not _ID.match(k):
            raise ClefRequestError(f"질문 ID가 규칙에 맞지 않아요(영문·숫자·_ . - 100자 이하): {k!r}")
        t = q.get("type")
        if t not in ("noul", "choice", "score") or not q.get("instructions"):
            raise ClefRequestError(f"질문 형식 오류: {k}")
        if t == "choice" and not (2 <= len(q.get("criteria") or {}) <= 255):
            raise ClefRequestError(f"choice 질문은 선택지가 2~255개여야 해요: {k}")
        if t == "score" and not (2 <= len(q.get("criteria") or []) <= 10):
            raise ClefRequestError(f"score 질문은 단계가 2~10개여야 해요: {k}")


# ---- 응답 정리 --------------------------------------------------------------------------------
def parse_answers(raw: dict) -> dict[str, dict]:
    """공식 출력 스키마 → 단순한 dict. noul:{p}, choice:{choice,probs,conf}, score:{score,probs,conf}. 이상한 항목은 건너뜀."""
    out: dict[str, dict] = {}
    for qid, a in (raw.get("answers") or {}).items():
        try:
            t = a.get("type")
            if t == "noul":
                out[qid] = {"type": "noul", "p": float(a["noul"])}
            elif t == "choice":
                out[qid] = {"type": "choice", "choice": str(a["choice"]), "probs": {k: float(v) for k, v in a["probabilities"].items()},
                            "conf": float(a.get("confidence", 0.0))}
            elif t == "score":
                out[qid] = {"type": "score", "score": float(a["score"]), "probs": {str(k): float(v) for k, v in a["probabilities"].items()},
                            "conf": float(a.get("confidence", 0.0))}
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return out


# ---- 캐시 -------------------------------------------------------------------------------------
class AnswerCache:
    """(영상 조각 해시 + 질문 내용) → 답. jsonl에 덧붙여 저장해서 중간에 끊겨도 이어서 할 수 있다."""

    def __init__(self, path: Path | None) -> None:
        self.path, self.lock, self.data = path, threading.Lock(), {}
        if path and path.exists():
            for line in path.read_text("utf-8").splitlines():
                try:
                    d = json.loads(line)
                    self.data[d["k"]] = d["a"]
                except (ValueError, KeyError):
                    continue

    @staticmethod
    def key(media_key: str, spec: dict) -> str:
        return media_key + ":" + hashlib.sha1(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

    def get(self, k: str):
        with self.lock:
            return self.data.get(k)

    def put(self, k: str, a: dict) -> None:
        with self.lock:
            self.data[k] = a
            if self.path:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as f:
                    f.write(json.dumps({"k": k, "a": a}, ensure_ascii=False) + "\n")


# ---- 비용 추정 --------------------------------------------------------------------------------
def estimate_tokens(video_seconds: float, n_questions: int, *, has_audio: bool = True) -> int:
    """문서 기준 근사: 480p 영상 ≈144토큰/초, 소리 ≈13토큰/초, 질문 ≈60토큰/개 + 고정 100."""
    return int(video_seconds * (144 + (13 if has_audio else 0)) + n_questions * 60 + 100)


def estimate_cost(tokens: int) -> float:
    return tokens * PRICE_PER_TOKEN


# ---- 클라이언트 -------------------------------------------------------------------------------
@dataclass
class ClefClient:
    account_id: str
    token: str
    base: str = "https://api.cloudflare.com"
    timeout: float = 120.0
    cache: AnswerCache | None = None
    retries: int = 3
    sleep: Callable[[float], None] = time.sleep
    input_tokens: int = 0
    requests: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def url(self) -> str:
        return f"{self.base.rstrip('/')}/client/v4/accounts/{self.account_id}/ai/run/@cf/cloudflare/{MODEL}"

    def _post(self, body: dict) -> dict:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            req = urllib.request.Request(self.url, data=data, method="POST", headers={
                "Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                text = e.read().decode("utf-8", "replace")
                msg = _error_message(text) or f"HTTP {e.code}"
                if e.code in (401, 403):
                    raise ClefAuthError(f"인증 실패({e.code}): 계정 ID와 토큰(Workers AI 권한)을 확인하세요 — {msg}") from None
                if e.code not in RETRY_STATUS:
                    raise ClefRequestError(f"요청 거절({e.code}): {msg}") from None
                last = ClefError(f"서버 오류({e.code}): {msg}")
                wait = float(e.headers.get("Retry-After") or 0) if e.headers else 0
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last, wait = ClefError(f"연결 실패: {e}"), 0
            if attempt < self.retries:
                self.sleep(max(wait, 2 ** attempt))
        raise ClefError(f"재시도 후에도 실패: {last}")

    def _call(self, state, questions: dict, videos: list[tuple[bytes, float]]) -> dict[str, dict]:
        body = {"model": MODEL, "state": state, "questions": questions}
        if videos:
            body["videos"] = [f"data:video/mp4;base64,{base64.b64encode(b).decode()}" for b, _ in videos]
        raw = self._post(body)
        if raw.get("success") is False:
            raise ClefError(_error_message(json.dumps(raw)) or "알 수 없는 오류")
        res = raw.get("result", raw)                          # Cloudflare REST는 result로 감싸서 준다
        with self.lock:
            self.requests += 1
            self.input_tokens += int((res.get("usage") or {}).get("input_tokens", 0))
        return parse_answers(res)

    def ask(self, state, questions: dict, videos: list[tuple[bytes, float]] | None = None,
            media_key: str | None = None) -> dict[str, dict]:
        """videos = [(mp4 바이트, 길이초)]. media_key를 주면 캐시를 쓴다(보통 영상 조각의 해시)."""
        videos = videos or []
        validate_questions(questions)
        if len(videos) > MAX_VIDEOS:
            raise ClefRequestError(f"영상은 요청당 {MAX_VIDEOS}개까지예요")
        for b, sec in videos:
            if len(b) > MAX_VIDEO_BYTES or sum(len(x) for x, _ in videos) > MAX_VIDEO_BYTES:
                raise ClefRequestError("영상이 16MiB를 넘어요 (조각을 더 짧게/낮은 화질로)")
            if sec > MAX_VIDEO_SEC:
                raise ClefRequestError("영상은 60초 이하여야 해요")
        found: dict[str, dict] = {}
        missing: dict[str, dict] = {}
        for qid, spec in questions.items():
            hit = self.cache.get(AnswerCache.key(media_key, spec)) if (self.cache and media_key) else None
            if hit is not None:
                found[qid] = hit
            else:
                missing[qid] = spec
        ids = list(missing)
        for i in range(0, len(ids), MAX_QUESTIONS):
            chunk = {k: missing[k] for k in ids[i:i + MAX_QUESTIONS]}
            for qid, a in self._call(state, chunk, videos).items():
                found[qid] = a
                if self.cache and media_key and qid in chunk:
                    self.cache.put(AnswerCache.key(media_key, chunk[qid]), a)
        return found

    def cost_so_far(self) -> float:
        return estimate_cost(self.input_tokens)


def _error_message(text: str) -> str:
    try:
        d = json.loads(text)
        errs = d.get("errors") or []
        return "; ".join(str(e.get("message", e)) if isinstance(e, dict) else str(e) for e in errs) or str(d.get("error", ""))[:200]
    except (ValueError, AttributeError):
        return text[:200]


def media_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:24]
