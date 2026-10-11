# 캡컷 에이전트

한국어 토킹 영상(mp4/mov) → **무음·잔말·NG 컷 + 자막**이 적용된 **캡컷 드래프트**를 자동 생성하는 로컬 웹 도구.
[pycapcut](https://github.com/GuanYixuan/pyJianYingDraft) 으로 드래프트를 만들고, FastAPI + 정적 HTML 1장으로 동작합니다.

## 실행
```bash
cd capcut-agent
pip install -r requirements.txt     # + ffmpeg 필요: brew install ffmpeg / winget install ffmpeg
python -m capcut_agent.server       # → http://127.0.0.1:8765
```
- Mac M칩(트랙 A): `pip install mlx-whisper` 하면 자동으로 mlx-whisper 사용, 그 외는 faster-whisper.
- 환경변수: `CAPCUT_DRAFT_DIR`(드래프트 폴더 강제 지정), `CAPCUT_WORKDIR`, `PORT`, `CAPCUT_MIN_STAGE`.
- CapCut 드래프트 폴더를 못 찾으면 `workspace/output/` 에 저장됩니다(CapCut 설치+1회 실행 후 자동 인식).

## 핵심 원칙
1. **전체 대본을 먼저 추출 → 그걸로 NG/자막 결정** (단어 단위 판단 X). 같은 문장이 다시 나오면 앞 테이크를 NG로, 마지막 테이크를 유지.
2. **검증 = 사용자가 캡컷에서 직접 재생.** 빌드 성공 ≠ 검증. 웹 프리뷰는 사전 확인용입니다.
3. ASR은 `asyncio.Lock`으로 직렬화, 캐시는 mtime이 아닌 **content hash**.

## 영상 대비 개선점
| 개선 | 효과 |
|---|---|
| 컷 건너뛰기 프리뷰 (재인코딩 없음) | 캡컷을 열기 전에 결과를 바로 들어볼 수 있음 |
| 컷별 토글 + `[` `]` 보존 마킹 → **ASR 재실행 없이** 드래프트 재생성 | 수정 1회 ≈ 1초 |
| 배경 소음 기반 **적응형 무음 임계값** | 고정 dB 오탐 감소 |
| 컷 경계 **숨쉬기 여유**(0.12s) + 0.35s 미만 파편 제거 | 로봇같은 컷·소리 파편 방지 |
| ffmpeg PCM을 ASR에 직접 전달 | PyAV 버전 충돌 제거, 이중 디코딩 제거 |
| SSE 이벤트 리플레이 | 새로고침/재접속해도 진행 상태 복원 |
| `tm_duration`/`draft_name` 보정 | pycapcut 기본 저장은 길이 0·이름 없음으로 표시됨 |

## 테스트
```bash
python -m pytest -q
```
품질확인서: [QUALITY.md](QUALITY.md)
