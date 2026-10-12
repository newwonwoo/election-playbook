"""로컬 설정(Clef-omni 계정). 파일 권한 600, API 응답에는 토큰을 마스킹해서 돌려준다."""
from __future__ import annotations

import json
import os
from pathlib import Path


class Settings:
    def __init__(self, workdir: Path) -> None:
        self.path = workdir / "settings.json"

    def _load(self) -> dict:
        try:
            return json.loads(self.path.read_text("utf-8"))
        except (OSError, ValueError):
            return {}

    def clef(self) -> dict:
        """파일 설정 위에 환경변수(CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN)가 우선."""
        c = dict(self._load().get("clef", {}))
        c["account_id"] = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or c.get("account_id", "")
        c["token"] = os.environ.get("CLOUDFLARE_API_TOKEN") or c.get("token", "")
        return c

    def configured(self) -> bool:
        c = self.clef()
        return bool(c["account_id"] and c["token"])

    def save_clef(self, account_id: str, token: str | None) -> None:
        d = self._load()
        c = d.setdefault("clef", {})
        c["account_id"] = account_id.strip()
        if token:                                            # 비워 두면 기존 토큰 유지
            c["token"] = token.strip()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), "utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.path)

    def clear_clef(self) -> None:
        d = self._load()
        d.pop("clef", None)
        if self.path.exists():
            self.path.write_text(json.dumps(d), "utf-8")

    def public(self) -> dict:
        c = self.clef()
        t = c["token"]
        return {"configured": self.configured(), "account_id": c["account_id"],
                "token_hint": ("…" + t[-4:]) if len(t) > 8 else ("설정됨" if t else ""),
                "from_env": bool(os.environ.get("CLOUDFLARE_API_TOKEN"))}
