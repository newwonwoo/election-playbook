"""접속 보호: 내 PC에서 도는 서버를 다른 웹사이트·외부 사람이 건드리지 못하게 한다. 비용 0(표준 라이브러리만).

- Host 검사: DNS 리바인딩 방지 (localhost/127.0.0.1 + MALGGEUM_ALLOWED_HOSTS 만 허용)
- Origin 검사: 다른 사이트가 보낸 쓰기 요청(POST/PUT/DELETE) 차단 (CSRF)
- 비밀번호(MALGGEUM_PASSWORD): 설정하면 로그인 쿠키가 있어야 접근. 터널로 외부에 열 때 필수
- 로그인 시도 제한: IP당 1분 5회 실패 시 잠금
순수 ASGI 미들웨어라 SSE(진행 스트림)·대용량 업로드를 건드리지 않는다.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import os
import time
from urllib.parse import parse_qs, urlsplit

COOKIE = "malggeum_auth"
SAFE = {"GET", "HEAD", "OPTIONS"}
LOGIN_PAGE = """<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>말끔 · 로그인</title><style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#f5f5f5;font:15px system-ui,sans-serif}}
form{{background:#161616;border:1px solid #262626;border-radius:12px;padding:28px;width:min(320px,90vw);display:grid;gap:12px}}
input{{background:#0a0a0a;border:1px solid #333;border-radius:8px;color:inherit;padding:10px;font:inherit}}
button{{background:#22c55e;color:#04210f;border:0;border-radius:8px;padding:10px;font:inherit;font-weight:600;cursor:pointer}}
p{{margin:0;color:#f87171;font-size:13px}}</style>
<form method="post" action="/login"><b>말끔</b>{msg}<input type="password" name="password" placeholder="비밀번호" autofocus required><button>들어가기</button></form></html>"""


class Guard:
    def __init__(self, password: str = "", allowed_hosts: list[str] | None = None,
                 max_fails: int = 5, window: float = 60.0):
        self.password = password
        self.hosts = {"localhost", "127.0.0.1", "[::1]", *(h.strip().lower() for h in (allowed_hosts or []) if h.strip())}
        self._key = hashlib.sha256(("malggeum|" + password).encode()).digest()
        self.max_fails, self.window = max_fails, window
        self._fails: dict[str, list[float]] = {}

    @classmethod
    def from_env(cls) -> "Guard":
        return cls(os.environ.get("MALGGEUM_PASSWORD", ""), os.environ.get("MALGGEUM_ALLOWED_HOSTS", "").split(","))

    def token(self) -> str:
        return hmac.new(self._key, b"ok", hashlib.sha256).hexdigest()

    def _locked(self, ip: str) -> bool:
        now = time.monotonic()
        self._fails[ip] = [t for t in self._fails.get(ip, []) if now - t < self.window]
        return len(self._fails[ip]) >= self.max_fails

    def __call__(self, app):
        async def mw(scope, receive, send):
            if scope["type"] != "http":
                return await app(scope, receive, send)
            h = {k.decode().lower(): v.decode("latin-1") for k, v in scope["headers"]}
            host = h.get("host", "").lower()
            hostname = host.rsplit(":", 1)[0] if not host.endswith("]") else host
            if hostname not in self.hosts:
                return await self._text(send, 421, "허용되지 않은 호스트입니다")
            method, path = scope["method"], scope["path"]
            origin = h.get("origin")
            if method not in SAFE and origin and urlsplit(origin).netloc.lower() != host:
                return await self._text(send, 403, "다른 사이트에서 온 요청은 차단됩니다")
            if self.password:
                if path == "/login":
                    return await self._login(scope, receive, send, method, h)
                cookies = dict(c.strip().split("=", 1) for c in h.get("cookie", "").split(";") if "=" in c)
                if not hmac.compare_digest(cookies.get(COOKIE, ""), self.token()):
                    if path.startswith("/api/"):
                        return await self._text(send, 401, "로그인이 필요합니다")
                    return await self._html(send, 200, LOGIN_PAGE.format(msg=""))
            return await app(scope, receive, send)
        return mw

    async def _login(self, scope, receive, send, method, h):
        ip = (scope.get("client") or ("?", 0))[0]
        if method != "POST":
            return await self._html(send, 200, LOGIN_PAGE.format(msg=""))
        body = b""
        while True:
            m = await receive()
            body += m.get("body", b"")
            if not m.get("more_body") or len(body) > 4096:
                break
        if self._locked(ip):
            return await self._html(send, 429, LOGIN_PAGE.format(msg="<p>시도가 너무 많습니다. 1분 뒤에 다시 하세요.</p>"))
        given = parse_qs(body.decode("utf-8", "ignore")).get("password", [""])[0]
        if not hmac.compare_digest(hashlib.sha256(given.encode()).digest(), hashlib.sha256(self.password.encode()).digest()):
            self._fails.setdefault(ip, []).append(time.monotonic())
            return await self._html(send, 401, LOGIN_PAGE.format(msg="<p>비밀번호가 맞지 않습니다.</p>"))
        self._fails.pop(ip, None)
        cookie = f"{COOKIE}={self.token()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000"
        await send({"type": "http.response.start", "status": 303,
                    "headers": [(b"location", b"/"), (b"set-cookie", cookie.encode()), (b"content-length", b"0")]})
        await send({"type": "http.response.body", "body": b""})

    async def _html(self, send, status, text):
        b = text.encode()
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"text/html; charset=utf-8"), (b"content-length", str(len(b)).encode())]})
        await send({"type": "http.response.body", "body": b})

    async def _text(self, send, status, msg):
        b = html.escape(msg).encode()
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"text/plain; charset=utf-8"), (b"content-length", str(len(b)).encode())]})
        await send({"type": "http.response.body", "body": b})
