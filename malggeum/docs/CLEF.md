# Clef-omni 연동 분석 (2026-10)

출처: [Cloudflare 모델 문서](https://developers.cloudflare.com/workers-ai/models/clef-omni/), [입력 스키마](https://developers.cloudflare.com/workers-ai/models/clef-omni/schema-input.json), [출력 스키마](https://developers.cloudflare.com/workers-ai/models/clef-omni/schema-output.json), [Hugging Face](https://huggingface.co/Cloudflare/clef-omni), [커뮤니티 데모](https://github.com/lucataco/clef-omni-media-search)

## 1. 이 모델이 무엇인가
오디오·영상·이미지·글을 함께 보고 **미리 정한 질문에 확률로 답하는 "판단 모델"**이다. 글을 생성하지 않는다(문서: "does not generate text").

| 항목 | 내용 |
|---|---|
| 호출 | `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/cloudflare/clef-omni`, `Authorization: Bearer <토큰>` |
| 요청 | `model:"clef-omni"`, `state`(필수), `questions`(1~64개), `videos[]`(최대 2개) |
| 영상 | base64 데이터 URL(`data:video/mp4;base64,…`), 개당 **16MiB·60초 이하**, 초당 2프레임, 원격 URL 불가, 소리는 모든 영상에 소리가 있을 때만 사용 |
| 질문 유형 | `noul`(예/아니오 → 확률), `choice`(2~255개 선택지), `score`(순서 있는 2~10단계) |
| 응답 | `{model, answers:{id:{type:"noul",noul:0~1} \| {type:"choice",choice,probabilities,confidence} \| {type:"score",score,legend,probabilities,confidence}}, usage:{input_tokens,output_tokens}}` |
| 가격 | 입력 토큰 100만 개당 $0.15 (출력 무료). 480p 영상 약 144토큰/초 + 소리 약 13토큰/초 |
| 한도 | 컨텍스트 64K 토큰 |

## 2. 알려진 약점 (조사로 확인)
- 성능 수치는 Cloudflare **자체 보고**이고, 오디오·영상 벤치마크는 공개되지 않았다.
- 확률의 **보정(calibration)** 은 사용자 데이터로 확인해야 한다 → 임계값은 실제 영상으로 조정.
- Cloudflare의 봇 차단이 파이썬 기본 User-Agent를 거절한다(오류 1010) → 우리 클라이언트는 별도 UA를 보낸다.
- HDR 같은 화소 속성은 볼 수 없고, 한 클립의 어느 순간에 일어난 일인지는 구분하지 못한다.

## 3. 우리 프로그램에서의 역할
Clef-omni는 **"보고 판단"만** 한다. 편집 결정과 수치 측정은 기존 로직(ffmpeg, 음성 분석)이 하고, Clef-omni의 답은 거기에 더해진다.

| 기능 | Clef-omni가 하는 일 | 우리가 하는 일 |
|---|---|---|
| 영상·구간 선별 | 8초 구간마다 얼굴 유무·위치, 슬라이드 화면, 흔들림, 어두움, 더듬음, 에너지, 단독 이해 가능 여부 판단 | 점수화, 나쁜 구간을 'AI 제안 컷'으로 표시, 훅·숏츠 후보 점수에 가산 |
| 스마트 리프레임 | 얼굴이 화면의 어느 쪽(5구간)에 있는지 | 그쪽을 중심으로 9:16 크롭·줌 |
| 레퍼런스 찾기 | 레퍼 영상 구간별 스타일 질문(큰 자막, 팝업, 줌, B-roll…)과 자유 질문에 답 | 내 레퍼 라이브러리 색인, 내 영상과의 유사도·질문 일치도 순위 |
| 스타일 반영 | 레퍼의 화면 요소 비율 | 컷 속도·무음 비율 측정(ffmpeg), 둘을 합쳐 새 프리셋(값과 근거 표시) |

## 4. 개인정보·비용 원칙
- **기본 꺼짐.** 켜면 영상 조각(480p, 8초 단위, 소리 포함)이 Cloudflare로 전송된다. 켜기 전에 전송 대상과 예상 비용을 보여준다.
- 계정 ID와 토큰은 로컬 `workspace/settings.json`(권한 600)에만 저장하고 API 응답에는 마스킹해서 돌려준다.
- 같은 영상 조각·같은 질문은 로컬 캐시로 재사용해서 다시 과금되지 않는다.
- 예상 비용: 8초 구간 한 번에 약 2천 토큰 ≈ $0.0003 (질문 11개 기준, 문서 가격으로 계산한 추정).

## 5. 구현·검증 상태 (v0.6)
- 구현: `clef.py`(클라이언트·캐시·견적), `vision.py`(구간 분석·리프레임·제안 컷), `refs.py`/`style.py`(레퍼 라이브러리·스타일 변환), 서버 엔드포인트와 UI.
- 검증: 공식 입출력 스키마를 따르는 **가짜 서버**로 요청 형식·파싱·재시도·캐시·화면 반영까지. 가짜 모델은 전송받은 영상 조각을 실제로 디코딩해서 답하게 해서 조각 자르기·위치 계산·크롭이 맞는지 끝까지 확인했다.
- **미검증: 실제 API 호출, AI 판단의 정확도, 확률 보정.** 처음 쓸 때 `AI 설정 → 연결 테스트`로 확인하고, 실제 영상 몇 편에서 얼굴 위치와 제안 컷이 맞는지 눈으로 확인한 뒤 신뢰 범위를 정하길 권한다.
