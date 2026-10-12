import math

import numpy as np

from malggeum import plan as PL, points as P, text as T
from malggeum.audio import SR
from tests.fixtures import (CHAPTER_STARTS, EXPECT_EMPHASIS, HOOK_IDX, LECTURE, NOT_EMPHASIS, make_lecture)


def setup():
    tr, x, dur, spans = make_lecture()
    return tr, x, dur, spans, [(0.0, dur)]


def test_text_helpers():
    assert T.strip_josa("3개월을") == "3개월" and T.strip_josa("연체율이") == "연체율"
    assert T.strip_josa("대위변제를") == "대위변제" and T.strip_josa("기간") == "기간"
    toks = T.content_tokens("연체가 발생하면 가장 먼저 채무자와 연락을 시도해야 합니다")
    assert "연체" in toks and "채무자" in toks and "합니다" not in toks


def test_emphasis_precision_recall():
    tr, x, dur, spans, keep = setup()
    got = P.detect_emphasis(tr, x, keep, min_gap=0.0, per_min=999)
    texts = {g.data["text"] for g in got}
    tp = texts & EXPECT_EMPHASIS
    precision, recall = len(tp) / max(1, len(texts)), len(tp) / len(EXPECT_EMPHASIS)
    print("emphasis", sorted(texts), "precision", precision, "recall", recall)
    assert precision == 1.0 and recall == 1.0, texts
    assert not (texts & NOT_EMPHASIS)                       # 조용하게 말한 '반드시'는 팝업 X (음량 신호 필요)
    assert "70퍼센트" in texts                               # 숫자+단위가 한 팝업으로 합쳐짐


def test_emphasis_density_control():
    tr, x, dur, spans, keep = setup()
    dense = P.detect_emphasis(tr, x, keep, min_gap=0.0, per_min=999)
    sparse = P.detect_emphasis(tr, x, keep, min_gap=6.0, per_min=999)
    assert len(sparse) < len(dense)
    assert all(b.start - a.start >= 6.0 for a, b in zip(sparse, sparse[1:]))
    capped = P.detect_emphasis(tr, x, keep, min_gap=0.0, per_min=2)
    assert len(capped) <= math.ceil(2 * dur / 60)


def test_emphasis_ignores_cut_words():
    tr, x, dur, spans, keep = setup()
    s, e = spans[HOOK_IDX]
    cut = [(0, s - 0.1), (e + 0.1, dur)]                    # 5번 문장 통째로 컷
    assert not any("3개월" in g.data["text"] for g in P.detect_emphasis(tr, x, cut, min_gap=0, per_min=99))


def test_hook_picks_best_sentence_not_dangling():
    tr, x, dur, spans, keep = setup()
    h = P.detect_hook(tr, x, keep)
    assert len(h) == 1 and abs(h[0].start - tr.segments[HOOK_IDX].words[0].start) < 0.01
    assert "3개월" in h[0].data["text"]
    dangling = tr.segments[13]                               # "그래서 이게 정말 중요한 부분인데요"
    assert P.hook_score(dangling)[0] < 3.0


def test_hook_skipped_for_short_video():
    tr, x, dur, spans, keep = setup()
    assert P.detect_hook(tr, x, [(0, 10)]) == []


def test_chapters_found_with_titles():
    tr, x, dur, spans, keep = setup()
    ch = P.detect_chapters(tr, keep, min_len=12)
    starts = {i for i, s in enumerate(tr.segments) for c in ch if abs(c.start - s.start) < 0.01}
    assert starts == CHAPTER_STARTS, (starts, [(c.label, c.data['why']) for c in ch])
    assert all(c.label.split(" ", 1)[1] for c in ch)         # 제목 비어있지 않음
    assert "담보" in ch[1].label and "구상권" in ch[2].label


def test_chapters_respect_min_length():
    tr, x, dur, spans, keep = setup()
    assert P.detect_chapters(tr, keep, min_len=500) == []


def test_split_for_zoom_never_mid_word_and_alternates():
    tr, x, dur, spans, keep = setup()
    parts = P.split_for_zoom(keep, tr, every=8.0)
    assert len(parts) > 3
    starts = [w.start for s in tr.segments for w in s.words]
    for (a, b), (c, d) in zip(parts, parts[1:]):
        assert abs(b - c) < 0.05 and c <= min(st for st in starts if st >= c - 1e-6) + 0.021   # 문장 시작 직전에서만 분할
    assert abs(parts[0][0]) < 1e-9 and abs(parts[-1][1] - dur) < 1e-9


def test_loudness_gain_levels_quiet_and_loud():
    tr, x, dur, spans, keep = setup()
    quiet, loud = np.zeros(SR * 4, "f4"), np.zeros(SR * 4, "f4")
    tone = np.sin(np.linspace(0, 4000, SR * 4)).astype("f4")
    quiet[:] = tone * 0.02
    loud[:] = tone * 0.5
    assert P.clip_gain_db(quiet, 0, 4) > 3 and P.clip_gain_db(loud, 0, 4) < -3
    assert P.clip_gain_db(quiet, 0, 0.5) is None
    assert -6.0 <= P.clip_gain_db(quiet, 0, 4) <= 6.0


def test_highlights_are_complete_and_nonoverlapping():
    tr, x, dur, spans, keep = setup()
    hl = P.detect_highlights(tr, x, keep, lo=15, hi=40)
    assert hl, "숏츠 후보가 하나도 없음"
    for a, b in zip(hl, hl[1:]):
        assert a.end <= b.start
    assert all(15 <= h.data["length"] <= 40 for h in hl)


def test_plan_shorts_full_edit():
    tr, x, dur, spans, keep = setup()
    info = {"width": 1920, "height": 1080, "fps": 30, "duration": dur}
    pl = PL.build(tr, x, keep, info, workflow="shorts", glossary="채권관리=채권 관리\n구상권")
    assert pl.canvas == (1080, 1920) and abs(pl.base_scale - 1920 / (1080 * 1080 / 1920)) < 1e-6
    assert pl.clips[0].kind == "teaser" and pl.teaser_len > 1.0
    main = [c for c in pl.clips if c.kind == "main"]
    assert abs(pl.out_duration - (pl.teaser_len + sum(c.src_e - c.src_s for c in main))) < 1e-6
    assert {c.scale for c in main} == {1.0, 1.15}
    assert any(o.kind == "pop" for o in pl.overlays) and not any(o.kind == "chapter" for o in pl.overlays)
    assert all(o.end <= pl.out_duration + 1e-6 for o in pl.overlays)
    assert pl.subs[0].start < 0.1 and any("채권 관리" in s.text for s in pl.subs)      # 용어 교정
    assert max(len(s.text) for s in pl.subs) <= 14                                     # 숏폼 자막 짧게


def test_plan_lecture_has_chapters_and_youtube_text():
    tr, x, dur, spans, keep = setup()
    P.PRESETS["lecture"]["min_chapter"] = 12                  # 합성 대본이 짧아서 임시 하향
    try:
        pl = PL.build(tr, x, keep, {"width": 1280, "height": 720, "fps": 30, "duration": dur}, workflow="lecture")
    finally:
        P.PRESETS["lecture"]["min_chapter"] = 45
    assert pl.teaser_len == 0 and all(c.scale == 1.0 for c in pl.clips)
    lines = pl.chapters_text.splitlines()
    assert len(lines) == 3 and lines[0].startswith("0:00 ")
    secs = [int(l.split()[0].split(":")[0]) * 60 + int(l.split()[0].split(":")[1]) for l in lines]
    assert secs == sorted(secs)


def test_point_toggle_off_disables_effect():
    tr, x, dur, spans, keep = setup()
    info = {"width": 1920, "height": 1080, "fps": 30, "duration": dur}
    base = PL.build(tr, x, keep, info, workflow="shorts")
    off = {p.key for p in base.points if p.kind in ("hook", "emphasis", "zoom")}
    pl = PL.build(tr, x, keep, info, workflow="shorts", off=off)
    assert pl.teaser_len == 0 and not [o for o in pl.overlays if o.kind == "pop"]
    assert all(c.scale == 1.0 for c in pl.clips)


def test_emphasis_does_not_repeat_same_term_quickly():
    from malggeum.asr import Segment, Transcript, Word
    loud_at = [2.0, 6.0, 10.0, 40.0]
    segs = [Segment(t0, t0 + 1, "연체", [Word(t0, t0 + 0.8, "연체")]) for t0 in loud_at]
    quiet = [Segment(t0, t0 + 1, "그냥", [Word(t0, t0 + 0.8, "그냥")]) for t0 in (14, 18, 22, 26, 30, 34, 36, 38, 42, 43)]
    x = np.zeros(SR * 46, "f4")
    tone = np.sin(np.linspace(0, 9000, SR * 46)).astype("f4")
    for s in segs:
        x[int(s.start * SR):int(s.end * SR)] = tone[int(s.start * SR):int(s.end * SR)] * 0.5
    for s in quiet:
        x[int(s.start * SR):int(s.end * SR)] = tone[int(s.start * SR):int(s.end * SR)] * 0.03
    tr = Transcript("ko", sorted(segs + quiet, key=lambda s: s.start))
    got = P.detect_emphasis(tr, x, [(0, 46)], min_gap=0.0, per_min=99)
    assert [round(g.start) for g in got] == [2, 40]        # 6s, 10s는 2s와 같은 용어 → 건너뜀, 40s는 20초 이상 떨어져 허용
