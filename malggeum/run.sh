#!/usr/bin/env bash
# 말끔 실행: 처음 한 번 설치 후 서버를 켜고 브라우저를 연다. 전부 무료·로컬.
#   ./run.sh            내 PC에서만 사용 (127.0.0.1)
#   ./run.sh --tunnel   무료 Cloudflare 터널로 폰·외부에서도 접속 (비밀번호 자동 생성)
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8765}"; export PORT
command -v ffmpeg >/dev/null || { echo "ffmpeg가 필요합니다 (mac: brew install ffmpeg / ubuntu: sudo apt install ffmpeg)"; exit 1; }
PY="$(command -v python3 || command -v python)" || { echo "Python 3.10+ 가 필요합니다"; exit 1; }
if [ ! -d .venv ]; then
  echo "처음 한 번만: 설치 중… (몇 분 걸립니다)"
  "$PY" -m venv .venv && .venv/bin/pip install -q -r requirements.txt || { rm -rf .venv; echo "설치 실패"; exit 1; }
fi
if [ "$1" = "--tunnel" ]; then
  command -v cloudflared >/dev/null || { echo "cloudflared가 필요합니다 (무료): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"; exit 1; }
  [ -f .password ] || head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 12 > .password
  export MALGGEUM_PASSWORD="$(cat .password)"
  LOG="$(mktemp)"; cloudflared tunnel --url "http://127.0.0.1:$PORT" >"$LOG" 2>&1 &
  TUN=$!; trap 'kill $TUN 2>/dev/null' EXIT
  for _ in $(seq 1 30); do URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1)"; [ -n "$URL" ] && break; sleep 1; done
  [ -n "$URL" ] || { echo "터널 주소를 얻지 못했습니다"; exit 1; }
  export MALGGEUM_ALLOWED_HOSTS="${URL#https://}"
  echo "외부 접속 주소: $URL   비밀번호: $MALGGEUM_PASSWORD"
fi
( sleep 2; (command -v open >/dev/null && open "http://127.0.0.1:$PORT") || (command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT") ) >/dev/null 2>&1 &
exec .venv/bin/python -m malggeum.server
