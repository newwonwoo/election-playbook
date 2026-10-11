"""접속 보호: Host/Origin 검사, 비밀번호 로그인, 시도 제한. SSE 같은 스트리밍은 건드리지 않는다."""
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from capcut_agent.guard import COOKIE, Guard


def make(guard: Guard) -> TestClient:
    app = FastAPI()

    @app.get("/")
    def index():
        return {"ok": 1}

    @app.post("/api/jobs")
    def create():
        return {"made": 1}

    @app.get("/api/stream")
    def stream():
        return StreamingResponse((f"data: {i}\n\n" for i in range(3)), media_type="text/event-stream")

    return TestClient(guard(app), base_url="http://localhost:8765", follow_redirects=False)


def test_foreign_host_blocked_dns_rebinding():
    c = make(Guard())
    assert c.get("/", headers={"host": "evil.example.com"}).status_code == 421
    assert c.get("/").status_code == 200


def test_cross_site_post_blocked_but_same_origin_ok():
    c = make(Guard())
    assert c.post("/api/jobs", headers={"origin": "https://evil.example.com"}).status_code == 403
    assert c.post("/api/jobs", headers={"origin": "http://localhost:8765"}).status_code == 200
    assert c.post("/api/jobs").status_code == 200              # curl 등 Origin 없는 호출은 통과


def test_tunnel_host_allowed_only_when_configured():
    assert make(Guard()).get("/", headers={"host": "my.trycloudflare.com"}).status_code == 421
    c = make(Guard(allowed_hosts=["my.trycloudflare.com"]))
    assert c.get("/", headers={"host": "my.trycloudflare.com"}).status_code == 200


def test_password_required_and_login_flow():
    c = make(Guard(password="s3cret"))
    assert c.get("/api/stream").status_code == 401
    assert "비밀번호" in c.get("/").text                        # 로그인 페이지
    assert c.post("/login", data={"password": "wrong"}).status_code == 401
    r = c.post("/login", data={"password": "s3cret"})
    assert r.status_code == 303 and COOKIE in r.headers["set-cookie"]
    assert "HttpOnly" in r.headers["set-cookie"] and "SameSite=Strict" in r.headers["set-cookie"]
    c.cookies.set(COOKIE, Guard(password="s3cret").token())
    assert c.get("/").json() == {"ok": 1}
    assert c.post("/api/jobs").status_code == 200
    assert c.get("/api/stream").text.count("data:") == 3        # 스트리밍 정상


def test_forged_cookie_rejected():
    c = make(Guard(password="s3cret"))
    c.cookies.set(COOKIE, "deadbeef")
    assert c.get("/api/stream").status_code == 401


def test_login_lockout_after_repeated_failures():
    c = make(Guard(password="s3cret", max_fails=3))
    for _ in range(3):
        assert c.post("/login", data={"password": "x"}).status_code == 401
    assert c.post("/login", data={"password": "s3cret"}).status_code == 429   # 맞는 비번도 잠금 중엔 거부


def test_no_password_means_open_on_localhost():
    assert make(Guard()).get("/api/stream").status_code == 200
