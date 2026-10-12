"""사람이 정답을 라벨링한 한국어 강의 대본(연체 채권 관리). 탐지 품질(정밀도/재현율) 측정용."""
import numpy as np

from malggeum.asr import Segment, Transcript, Word
from malggeum.audio import SR

# (앞 휴지(초), 문장, 큰 소리로 말한 단어 목록)
LECTURE = [
    (0.5, "안녕하세요 오늘은 연체 채권 관리의 기본을 알아보겠습니다", []),
    (0.3, "채권관리는 결국 회수 가능성을 높이는 일입니다", []),
    (0.3, "연체가 발생하면 가장 먼저 채무자와 연락을 시도해야 합니다", []),
    (0.3, "연락이 안 되는 기간이 길어질수록 회수율이 떨어집니다", []),
    (0.3, "사실 연체 3개월을 넘기면 회수율이 절반으로 떨어집니다", []),               # 5: 훅 후보
    (2.2, "다음으로 담보 물건의 상태를 점검하는 방법입니다", []),                       # 챕터 경계
    (0.3, "담보 가치가 하락하면 보증기관의 손실이 커집니다", []),
    (0.3, "그래서 정기적인 감정평가가 반드시 필요합니다", []),                         # 반드시: 조용 → 제외
    (0.3, "감정평가는 최소 1년에 한 번은 해야 합니다", []),
    (0.3, "담보 설정 비율은 보통 70 퍼센트 이내로 관리합니다", []),
    (2.5, "마지막으로 대위변제 이후의 구상권 행사입니다", []),                         # 챕터 경계
    (0.3, "구상권은 소멸시효가 있기 때문에 이 부분이 핵심입니다", ["핵심입니다"]),       # 핵심: 큰 소리 → 포함
    (0.3, "소멸시효는 보통 5년이며 중단 절차를 밟으면 연장됩니다", []),
    (0.3, "그래서 이게 정말 중요한 부분인데요", []),                                  # 앞문맥 필요 → 훅 아님
    (0.3, "오늘 내용이 도움이 되셨다면 구독 부탁드립니다", []),
]
HOOK_IDX = 4
CHAPTER_STARTS = {0, 5, 10}
EXPECT_EMPHASIS = {"3개월", "1년", "70퍼센트", "5년", "핵심"}
NOT_EMPHASIS = {"반드시"}


def make_lecture(seed=0):
    rng = np.random.default_rng(seed)
    t, segs, sent_spans, loud_spans = 0.0, [], [], []
    for gap, text, loud in LECTURE:
        t += gap
        words, s0 = [], t
        for w in text.split():
            words.append(Word(round(t, 3), round(t + 0.38, 3), w))
            if w in loud:
                loud_spans.append((t, t + 0.38))
            t += 0.45
        segs.append(Segment(s0, words[-1].end, text, words))
        sent_spans.append((s0, words[-1].end))
    dur = t + 1.0
    x = np.zeros(int(dur * SR), dtype="f4")
    tt = np.arange(len(x)) / SR
    tone = np.sin(2 * np.pi * 180 * tt).astype("f4")
    for s, e in sent_spans:
        a, b = int(s * SR), int(e * SR)
        x[a:b] = tone[a:b] * rng.uniform(0.07, 0.11)
    for s, e in loud_spans:
        a, b = int(s * SR), int(e * SR)
        x[a:b] = tone[a:b] * 0.45
    return Transcript("ko", segs), x, dur, sent_spans
