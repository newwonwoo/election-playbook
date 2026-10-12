import os
import stat

import pytest

from malggeum import clef
from malggeum.settings import Settings
from tests.fakecf import FakeCF


@pytest.fixture
def cf():
    f = FakeCF()
    yield f
    f.close()


def client(cf, **kw):
    return clef.ClefClient("acct123", "good-token", base=cf.url, sleep=lambda s: None, **kw)


QS = {"face": clef.noul("Is a face visible?"),
      "pos": clef.choice("Where?", {"left": "left", "center": "center", "right": "right"}),
      "shaky": clef.score("How shaky?", ["stable", "slightly", "very"])}


def test_request_matches_official_schema(cf):
    c = client(cf)
    ans = c.ask("a clip", QS, videos=[(b"\x00\x01mp4bytes", 8.0)])
    r = cf.requests[0]
    assert r["path"] == "/client/v4/accounts/acct123/ai/run/@cf/cloudflare/clef-omni"
    assert r["headers"]["Authorization"] == "Bearer good-token" and "python-urllib" not in r["headers"]["User-Agent"].lower()
    b = r["body"]
    assert b["model"] == "clef-omni" and b["state"] == "a clip" and set(b["questions"]) == set(QS)
    assert b["videos"][0].startswith("data:video/mp4;base64,")
    assert b["questions"]["pos"]["criteria"] == {"left": "left", "center": "center", "right": "right"}
    assert b["questions"]["shaky"]["criteria"] == ["stable", "slightly", "very"]
    assert ans["face"] == {"type": "noul", "p": 0.5}
    assert ans["pos"]["choice"] == "left" and abs(sum(ans["pos"]["probs"].values()) - 1) < 1e-9
    assert ans["shaky"]["score"] == 1.0 and c.input_tokens == 1030 and c.requests == 1


def test_parse_handles_raw_and_enveloped_and_garbage():
    raw = {"answers": {"a": {"type": "noul", "noul": 0.2}, "b": {"type": "noul"}, "c": "junk",
                       "d": {"type": "choice", "choice": "x", "probabilities": {"x": 1.0}, "confidence": 1}}}
    out = clef.parse_answers(raw)
    assert out == {"a": {"type": "noul", "p": 0.2}, "d": {"type": "choice", "choice": "x", "probs": {"x": 1.0}, "conf": 1.0}}


def test_more_than_64_questions_are_batched(cf):
    qs = {f"q{i}": clef.noul(f"question {i}?") for i in range(70)}
    ans = client(cf).ask("s", qs)
    assert len(ans) == 70 and [len(r["body"]["questions"]) for r in cf.requests] == [64, 6]


def test_cache_skips_repeats_and_asks_only_new(cf, tmp_path):
    cache = clef.AnswerCache(tmp_path / "c.jsonl")
    c = client(cf, cache=cache)
    c.ask("s", {"a": clef.noul("A?")}, [(b"clipbytes", 3)], media_key="m1")
    assert len(cf.requests) == 1
    c.ask("s", {"a": clef.noul("A?")}, [(b"clipbytes", 3)], media_key="m1")
    assert len(cf.requests) == 1                                           # 같은 조각 + 같은 질문 → 요청 없음
    c.ask("s", {"a": clef.noul("A?"), "b": clef.noul("B?")}, [(b"clipbytes", 3)], media_key="m1")
    assert len(cf.requests) == 2 and list(cf.requests[1]["body"]["questions"]) == ["b"]      # 새 질문만
    c.ask("s", {"a": clef.noul("A?")}, [(b"other", 3)], media_key="m2")
    assert len(cf.requests) == 3                                           # 다른 조각은 다시 물어봄
    again = clef.AnswerCache(tmp_path / "c.jsonl")                         # 재시작 후에도 유지
    assert client(cf, cache=again).ask("s", {"a": clef.noul("A?")}, [(b"clipbytes", 3)], media_key="m1")["a"]["p"] == 0.5 and len(cf.requests) == 3


def test_retry_then_success_and_no_retry_for_auth_or_bad_request(cf):
    cf.fail = [(429, {"Retry-After": "1"}), (503, {})]
    waits = []
    c = clef.ClefClient("acct123", "good-token", base=cf.url, sleep=waits.append)
    assert c.ask("s", {"a": clef.noul("A?")})["a"]["p"] == 0.5 and len(cf.requests) == 3 and waits[0] >= 1
    n = len(cf.requests)
    with pytest.raises(clef.ClefAuthError):
        clef.ClefClient("acct123", "bad", base=cf.url, sleep=lambda s: None).ask("s", {"a": clef.noul("A?")})
    assert len(cf.requests) == n + 1                                       # 인증 실패는 재시도하지 않음
    cf.fail = [(400, {})]
    with pytest.raises(clef.ClefRequestError, match="fail 400"):
        client(cf).ask("s", {"a": clef.noul("A?")})
    cf.fail = [(500, {})] * 5
    with pytest.raises(clef.ClefError, match="재시도 후에도 실패"):
        client(cf).ask("s", {"a": clef.noul("A?")})


def test_preflight_limits_make_no_network_calls(cf):
    c = client(cf)
    with pytest.raises(clef.ClefRequestError, match="16MiB"):
        c.ask("s", QS, [(b"x" * ((16 << 20) + 1), 10)])
    with pytest.raises(clef.ClefRequestError, match="60초"):
        c.ask("s", QS, [(b"x", 61)])
    with pytest.raises(clef.ClefRequestError, match="2개"):
        c.ask("s", QS, [(b"x", 1)] * 3)
    with pytest.raises(clef.ClefRequestError, match="ID"):
        c.ask("s", {"bad id!": clef.noul("A?")})
    with pytest.raises(clef.ClefRequestError):
        c.ask("s", {"x": clef.choice("?", {"only": "one"})})
    with pytest.raises(clef.ClefRequestError):
        c.ask("s", {})
    assert cf.requests == []


def test_default_python_user_agent_would_be_blocked(cf):
    import json
    import urllib.request
    req = urllib.request.Request(cf.url + "/client/v4/accounts/acct123/ai/run/@cf/cloudflare/clef-omni", data=b"{}", method="POST",
                                 headers={"Authorization": "Bearer good-token", "Content-Type": "application/json"})
    with pytest.raises(Exception):
        urllib.request.urlopen(req)                                        # urllib 기본 UA → 1010 차단 흉내 (그래서 우리는 UA를 따로 보낸다)


def test_cost_estimate():
    t = clef.estimate_tokens(8, 11)
    assert 1500 < t < 3000 and abs(clef.estimate_cost(t) - t * 0.15e-6) < 1e-12
    assert clef.estimate_tokens(16, 11) > t


def test_settings_masking_permissions_and_env(tmp_path, monkeypatch):
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)
    s = Settings(tmp_path)
    assert not s.configured() and s.public()["token_hint"] == ""
    s.save_clef(" acct ", "secret-token-1234")
    assert s.configured() and s.public() == {"configured": True, "account_id": "acct", "token_hint": "…1234", "from_env": False}
    assert "secret-token" not in str(s.public())
    assert stat.S_IMODE(os.stat(s.path).st_mode) == 0o600
    s.save_clef("acct2", None)                                              # 토큰 비우면 기존 토큰 유지
    assert s.clef()["token"] == "secret-token-1234" and s.clef()["account_id"] == "acct2"
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "env-token-9999")
    assert s.clef()["token"] == "env-token-9999" and s.public()["from_env"]
    s.clear_clef()
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN")
    assert not s.configured()
