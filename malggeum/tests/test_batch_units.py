from malggeum import media, subfile as SF

SRT = """﻿1
00:00:01,000 --> 00:00:03,000
안녕하세요 <i>여러분</i>

2
00:00:03,500 --> 00:00:06,000
오늘은 {\\an8}채권관리 이야기
두 번째 줄입니다

garbage block without timing

3
00:00:07,000 --> 00:00:06,000
시간이 거꾸로라 버려짐

4
00:01:02,500 --> 00:01:04,000
분 단위도 읽는다
"""

VTT = """WEBVTT

intro
00:01.000 --> 00:03.000 align:start
첫 줄

00:00:04.000 --> 00:00:05.500
둘째 줄
"""


def test_parse_srt_strips_tags_joins_lines_skips_garbage():
    cues = SF.parse(SRT)
    assert [(c.start, c.end) for c in cues] == [(1.0, 3.0), (3.5, 6.0), (62.5, 64.0)]
    assert cues[0].text == "안녕하세요 여러분" and cues[1].text == "오늘은 채권관리 이야기 두 번째 줄입니다"


def test_parse_vtt_with_ids_and_short_timestamps():
    cues = SF.parse(VTT)
    assert [(c.start, c.end, c.text) for c in cues] == [(1.0, 3.0, "첫 줄"), (4.0, 5.5, "둘째 줄")]


def test_read_text_handles_korean_legacy_encodings(tmp_path):
    for enc in ("utf-8", "utf-8-sig", "cp949"):
        f = tmp_path / f"a_{enc}.srt"
        f.write_bytes("1\n00:00:01,000 --> 00:00:02,000\n한글 자막입니다\n".encode(enc))
        assert SF.parse_file(f)[0].text == "한글 자막입니다", enc


def test_to_transcript_uses_voiced_part_and_is_monotonic():
    cues = [SF.Cue(1.0, 5.0, "하나 둘셋 넷다섯여섯")]
    speech = [(2.0, 4.0)]                                       # 큐 안에서 2~4초만 목소리가 있다
    tr = SF.to_transcript(cues, speech)
    ws = tr.segments[0].words
    assert [w.text for w in ws] == ["하나", "둘셋", "넷다섯여섯"]
    assert 2.0 <= ws[0].start and ws[-1].end <= 4.0             # 무음 구간에 단어가 걸리지 않는다
    assert all(a.end <= b.start + 1e-9 for a, b in zip(ws, ws[1:])) and all(w.end > w.start for w in ws)
    assert ws[2].end - ws[2].start > ws[0].end - ws[0].start     # 긴 단어일수록 오래


def test_to_transcript_falls_back_to_whole_cue_and_applies_offset():
    tr = SF.to_transcript([SF.Cue(0.0, 2.0, "가나 다라")], speech=[], offset=100.0)
    s = tr.segments[0]
    assert 100.0 <= s.start < s.end <= 102.0 and s.words[0].start >= 100.0
    assert SF.to_transcript([SF.Cue(0, 1, "   ")], []).segments == []          # 빈 큐는 건너뜀


def test_pair_by_stem_then_by_order():
    assert SF.pair(["a.mp4", "b.mov"], ["B.srt", "A.vtt"]) == [1, 0]           # 이름 일치 (대소문자 무시)
    assert SF.pair(["a.mp4", "b.mp4", "c.mp4"], ["b.srt"]) == [None, 0, None]  # 일부만
    assert SF.pair(["x.mp4", "y.mp4"], ["1.srt", "2.srt"]) == [0, 1]           # 이름이 전혀 안 맞고 개수 같음 → 순서
    assert SF.pair(["x.mp4", "y.mp4"], ["1.srt"]) == [None, None]              # 개수 다르면 짝짓지 않음
    assert SF.pair(["a.mp4", "a.mov"], ["a.srt"]) == [0, None]                 # 같은 이름 영상 둘 → 첫 번째만


def test_media_layout_split_and_scale():
    s = [media.Src("a.mp4", "/a", duration=10, width=1920, height=1080, fps=30),
         media.Src("b.mp4", "/b", duration=5, width=1080, height=1920, fps=30)]
    media.layout(s)
    assert [x.offset for x in s] == [0, 10] and media.total(s) == 15 and media.boundaries(s) == [10]
    parts = media.split(s, 8, 12)                                  # 경계를 넘는 구간 → 두 조각
    assert [(p[0].name, round(p[1], 3), round(p[2], 3)) for p in parts] == [("a.mp4", 8, 10), ("b.mp4", 0, 2)]
    assert media.split(s, 3, 4)[0][0].name == "a.mp4" and len(media.split(s, 3, 4)) == 1
    canvas = (1080, 1920)
    assert abs(media.cover_ratio(s[0], canvas) - 3.1605) < 0.001 and media.cover_ratio(s[1], canvas) == 1.0
    assert media.scale_k(s[0], canvas, False) < media.scale_k(s[0], canvas, True)
