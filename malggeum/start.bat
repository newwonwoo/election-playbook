@echo off
chcp 65001 >nul
cd /d "%~dp0"
where ffmpeg >nul 2>nul || (echo ffmpeg가 필요합니다: winget install ffmpeg & pause & exit /b 1)
if not exist .venv (
  echo 처음 한 번만: 설치 중... 몇 분 걸립니다
  python -m venv .venv && .venv\Scripts\pip install -q -r requirements.txt || (rmdir /s /q .venv & echo 설치 실패 & pause & exit /b 1)
)
start "" http://127.0.0.1:8765
.venv\Scripts\python -m malggeum.server
pause
