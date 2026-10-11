# 시장·기능 조사와 갭 분석 (2026-10 조사)

목적: 비슷한 도구들이 어떤 기능(편집 + 백엔드)을 제공하는지 확인하고, 우리 프로그램에 없는 것을 우선순위로 정리한다.
**신뢰도 주의:** 아래 내용은 웹 검색 요약이며 대부분 각 제품의 홍보 페이지나 제3자 후기다. 독립 검증이나 직접 사용 결과가 아니다.

## 1. 조사한 제품과 확인된 기능

| 제품 | 확인된 기능 | 출처 |
|---|---|---|
| Vrew(브루) | 자동 자막(초벌 후 오류만 수정), 텍스트 기반 편집(대본을 고치듯 영상 컷), 무음 구간 줄이기, 자막 스타일(색·배경 상자) | [tilnote](https://tilnote.io/pages/69112f9958b9731ea3dd890b), [Vrew 공식](https://vrew.ai/en/solutions/creator-video-online) |
| OpusClip | 긴 영상 → 숏츠, 클립별 바이럴 점수, 화자/객체 추적 리프레임(9:16·1:1·16:9), 애니메이션 자막(20여 개 언어), AI B-roll(Pro, 랩 단계), 브랜드 템플릿, API/웹훅, 동시 처리 제한(Pro 4건, 초과 시 429 — 제3자 요약) | [가격 페이지](https://www.opus.pro/es-es/pricing), [웹훅 문서](https://help.opus.pro/api-reference/webhook), [API v2](https://help.opus.pro/api-reference/v2/introduction) |
| Descript | 군말 제거, **재촬영(retake) 자동 삭제**, Studio Sound(음질 개선), 시선 보정, Overdub(음성 복제로 말 고치기), 기능별 크레딧 과금 | [Descript](https://www.descript.com/use-cases/removing-ums-and-filler-words-from-a-recording), [후기](https://vidpros.com/descript-review/) |
| Submagic | 자막 + 이모지·키워드 강조·애니메이션, 맥락 B-roll 자동 삽입, 줌 효과, 효과음·배경음악, 무음 제거, 오디오 정리, 시선 보정, 클립 추출, 설명·해시태그 자동 생성 | [Submagic](https://www.submagic.co/de/features/auto-video-editor) |
| CapCut | 자동 자막, 군말 제거(삭제/대체), 자동 리프레임(사람·사물 우선), AutoCut(무음·장면 전환 기반 하이라이트) | [CapCut AI](https://www.capcut.com/resource/capcut-ai) |
| Shotstack / Creatomate | 영상 편집 API. Shotstack은 JSON 템플릿 + 변수 치환 + AWS 기반, 렌더 큐는 사용자가 신경 써야 한다고 서술. Creatomate는 노코드 에디터 + 스프레드시트·Zapier 연동 | [비교 글](https://www.submagic.co/it/blog/creatomate-vs-shotstack) (경쟁사 작성) |

**조사로 확인하지 못한 것:** Vrew의 AI 목소리 기능 여부, Opus 이외 제품의 웹훅·일괄 처리 사양, 한국어 자막 사용자 불만에 대한 국내 설문, 한국어에서의 Whisper 단어 타임스탬프 정확도(WhisperX 한국어 정렬 모델 지원 여부 포함).

## 2. 사용자 불만 (확인된 범위)
- 자동 자막의 오타·인식 오류가 많다 ([GPTers 사례](https://www.gpters.org/nocode/post/schadenfreude-automating-shorts-making-WERVbiDis0qRDOu)).
- 자동 생성 자막에는 수정 기능이 없어 외부 편집기에서 고쳐야 한다는 질문 ([인프런](https://www.inflearn.com/questions/1722031)).
- 앱이 튕기거나 프로젝트가 사라지고, 기기 간 동기화가 안 된다는 해외 후기 ([eesel](https://www.eesel.ai/blog/captions-ai-review)).

## 3. 우리 프로그램 현황 대비 갭

### 편집 기능
| 기능 | 시장 | 우리 | 판단 |
|---|---|---|---|
| 무음·군말·NG(재촬영) 컷 | 표준 | 있음 | - |
| 챕터·훅·줌·강조 팝업·음량 | 일부 | 있음 | - |
| **대본을 고쳐서 영상 편집(텍스트 기반 편집)** | Vrew·Descript 핵심 | 단어 클릭 이동만 | **갭 (높음)** |
| **자막 문구 직접 수정 후 재렌더** | 표준 + 사용자 불만 확인 | 용어 사전만 | **갭 (높음)** |
| 음질 보정(노이즈 제거·라우드니스 표준화) | Descript·Submagic | 클립별 게인만 | 갭 (쉬움: ffmpeg 필터) |
| 자막 스타일 템플릿·브랜드 킷 | Opus·Vrew | 고정 스타일 | 갭 (중간) |
| 얼굴/화자 추적 리프레임 | Opus·CapCut | 중앙 크롭 | 갭 (어려움: 영상 인식 모델 필요) |
| B-roll·효과음·배경음악 | Submagic | 없음 | 갭 (소재·라이선스 필요) |
| 숏츠 후보 점수 | Opus | 있음(규칙 기반) | 정확도 미검증 |
| 다국어 자막·번역 | Opus 등 | 한국어만 | 필요 시 |
| 시선 보정·음성 복제 | Descript·Submagic | 없음 | 제외 권장 |

### 백엔드(서비스 운영) 기능
| 기능 | 시장 | 우리 | 판단 |
|---|---|---|---|
| **작업 영속화(재시작해도 유지)** | 표준 | 메모리에만 저장, 서버 재시작 시 모두 사라짐 | **갭 (높음)** |
| **작업 큐 + 동시 처리 제한 + 취소** | Opus는 동시 4건 제한 | 제한 없이 동시 실행 (ASR만 직렬) | **갭 (높음)** |
| 업로드 이어받기(대용량) | 일반적 | 500MB 단일 요청 | 갭 (중간) |
| 일괄 처리(여러 파일·폴더 감시) | 업무용에 필수 | 1개씩 | 갭 (중간) |
| 템플릿·브랜드 킷 저장 | Opus(브랜드 템플릿 API), Shotstack(JSON 템플릿) | 프리셋 3개 고정 | 갭 (중간) |
| API 키·웹훅·호출 제한 | Opus | 없음 | 외부 연동 시 필요 |
| 로그인·권한·사용량 | 서비스형 | 없음(로컬 127.0.0.1) | 여러 명이 쓸 때만 |
| 저장소 정리(보관 기한) | 일반적 | 없음 (업로드·중간 파일 누적) | 갭 (쉬움) |
| 외부 저장소(S3)·GPU 워커 | 서비스형 | 없음 | 규모가 커질 때 |
| 단어 타임스탬프 정밀화 | WhisperX 등 | Whisper 기본 | 한국어 검증 선행 필요 |

## 4. 우선순위 제안
**P0 — 신뢰성(백엔드):** ① 작업 영속화(SQLite) ② 작업 큐·동시 처리 제한·취소 ③ 보관 기한 정리.
**P0 — 편집 핵심:** ④ 대본 수정으로 영상 편집(텍스트 기반 편집) ⑤ 자막 문구 직접 수정 후 재렌더 ⑥ 음질 보정(loudnorm + 노이즈 제거).
**P1:** 일괄 처리, 템플릿·브랜드 킷, 업로드 이어받기, 자막 스타일 선택.
**P2 (사용 형태에 따라):** API 키·웹훅, 로그인·권한, S3·GPU 워커, 얼굴 추적 리프레임, B-roll·SFX.
**보류:** 시선 보정, 음성 복제(Overdub).

## 5. 결정이 필요한 것
사용 형태에 따라 P1~P2 범위가 달라진다: **혼자 쓰는 로컬 도구**인지, **회사 여러 명이 쓰는 서비스**인지.
