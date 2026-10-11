"""공식 입출력 스키마를 따르는 가짜 Cloudflare Workers AI 서버 (테스트용). 실제 API가 아니다."""
import base64
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ID = re.compile(r"^[A-Za-z0-9_.\-]{1,100}$")


class FakeCF:
    def __init__(self, handler=None, token="good-token", account="acct123"):
        self.requests, self.fail, self.token, self.account = [], [], token, account
        self.handler = handler or self.default
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append({"path": self.path, "headers": dict(self.headers), "body": body})
                if "python-urllib" in self.headers.get("User-Agent", "").lower():
                    return self._send(403, {"success": False, "errors": [{"message": "error code: 1010"}]})   # 실제 Cloudflare 봇 차단 흉내
                if self.headers.get("Authorization") != f"Bearer {outer.token}":
                    return self._send(401, {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]})
                if outer.fail:
                    code, extra = outer.fail.pop(0)
                    return self._send(code, {"success": False, "errors": [{"message": f"fail {code}"}]}, extra)
                if self.path != f"/client/v4/accounts/{outer.account}/ai/run/@cf/cloudflare/clef-omni":
                    return self._send(404, {"success": False, "errors": [{"message": "no route"}]})
                qs = body.get("questions", {})
                if body.get("model") != "clef-omni" or "state" not in body or not (1 <= len(qs) <= 64) or not all(ID.match(k) for k in qs):
                    return self._send(400, {"success": False, "errors": [{"message": "invalid request"}]})
                videos = [base64.b64decode(v.split(",", 1)[1]) for v in body.get("videos", []) if v.startswith("data:video/mp4;base64,")]
                answers = {qid: outer.handler(qid, q, videos, body) for qid, q in qs.items()}
                self._send(200, {"result": {"model": "clef-omni", "answers": answers,
                                            "usage": {"input_tokens": 1000 + 10 * len(qs), "output_tokens": 0}},
                                 "success": True, "errors": [], "messages": []})

            def _send(self, code, obj, headers=None):
                data = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                for k, v in (headers or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @staticmethod
    def default(qid, q, videos, body):
        if q["type"] == "noul":
            return {"type": "noul", "noul": 0.5}
        if q["type"] == "choice":
            opts = list(q["criteria"])
            n = len(opts)
            probs = {o: (0.6 if i == 0 else 0.4 / (n - 1)) for i, o in enumerate(opts)}
            return {"type": "choice", "choice": opts[0], "probabilities": probs, "confidence": 0.6}
        lv = q["criteria"]
        probs = {str(i): 1 / len(lv) for i in range(len(lv))}
        return {"type": "score", "score": (len(lv) - 1) / 2, "legend": {str(i): d for i, d in enumerate(lv)}, "probabilities": probs, "confidence": 0.3}

    def close(self):
        self.server.shutdown()
