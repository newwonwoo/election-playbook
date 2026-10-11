import numpy as np

from capcut_agent import audio, cuts as C, filler, subtitles
from capcut_agent.asr import Segment, Transcript, Word


def test_subtract_and_merge():
    assert C.subtract([(0, 10)], [(2, 3), (5, 6)]) == [(0, 2), (3, 5), (6, 10)]
    assert C.merge([(0, 1), (1.05, 2)], gap=0.1) == [(0, 2)]


def test_compute_keep_drops_slivers_and_honors_marks():
    cuts = [C.Cut(0, "silence", 1, 4), C.Cut(1, "filler", 4.1, 9.9, enabled=True)]
    # 0~1, 4~4.1(0.1s 조각), 9.9~10(0.1s 조각) → 모두 min_keep 미만이라 제거
    assert C.compute_keep(10, cuts, min_keep=0.2) == [(0, 1)]
    assert C.compute_keep(10, cuts, keep_marks=[(5, 6)]) == [(0, 1), (5, 6)]
    cuts[0].enabled = False                                   # 토글 해제 → 복원
    assert C.compute_keep(10, cuts) == [(0, 4.1)]


def test_remap():
    keep = [(0, 1), (3, 5)]
    assert C.remap(0.5, keep) == 0.5 and C.remap(4, keep) == 2 and C.remap(2, keep) is None
    assert C.remap_clamp(2, keep) == 1 and C.remap_clamp(9, keep) == 3


def test_adaptive_threshold_tracks_noise_floor():
    rng = np.random.default_rng(0)
    quiet = rng.normal(0, 0.001, 16000 * 4).astype("f4")           # 조용한 방
    loud = rng.normal(0, 0.02, 16000 * 4).astype("f4")             # 시끄러운 방
    speech = (0.3 * np.sin(np.linspace(0, 6000, 16000 * 2))).astype("f4")
    t_q = audio.auto_threshold(audio.frame_db(np.concatenate([quiet, speech, quiet])))
    t_l = audio.auto_threshold(audio.frame_db(np.concatenate([loud, speech, loud])))
    assert t_l > t_q                                               # 시끄러울수록 임계가 올라간다


def test_filler_ng_detection(transcript):
    found = filler.detect(transcript)
    kinds = [(k, round(s, 1)) for k, s, e, _ in found]
    assert ("ng", 0.1) in kinds and ("filler", 4.1) in kinds
    assert not any(k == "filler" and s < 4 for k, s, e, _ in found)   # NG 구간 안의 단어는 중복 컷 안 함


def test_stutter_and_aggressive():
    seg = Segment(0, 3, "그 그 막 시작", [Word(0, .3, "그"), Word(.4, .7, "그"), Word(.8, 1.0, "막"), Word(1.1, 2, "시작")])
    tr = Transcript("ko", [seg])
    assert [round(s, 1) for k, s, e, l in filler.detect(tr)] == [0.0]                  # 반복 1회
    assert len(filler.detect(tr, aggressive=True)) == 3                                  # 그,그,막


def test_subtitles_follow_keep_and_srt(transcript):
    keep = [(4.45, 6.0)]                                           # 음(4.1~4.4) 컷 후
    subs = subtitles.build(transcript, keep)
    assert subs and subs[0].text.startswith("오늘은") and "음" not in subs[0].text.split()
    assert subs[0].start == 0.05 or subs[0].start >= 0
    assert "-->" in subtitles.to_srt(subs)
