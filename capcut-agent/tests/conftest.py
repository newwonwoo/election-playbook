import subprocess
import pytest

from capcut_agent.asr import Segment, Transcript, Word


@pytest.fixture(scope="session")
def video(tmp_path_factory):
    """발화(톤) 0~2s, 4~6s / 무음 2~4s, 6~8s. 640x360 30fps."""
    p = tmp_path_factory.mktemp("v") / "talk.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=640x360:d=8:r=30",
        "-f", "lavfi", "-i", "aevalsrc=0.5*sin(2*PI*300*t)*(lt(t\\,2)+between(t\\,4\\,6)):s=16000:d=8",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(p)], check=True)
    return p


def W(s, e, t):
    return Word(s, e, t)


@pytest.fixture
def transcript():
    a = Segment(0.1, 1.9, "오늘은 채권관리 이야기", [W(.1, .6, "오늘은"), W(.7, 1.3, "채권관리"), W(1.4, 1.9, "이야기")])
    b = Segment(4.1, 5.9, "음 오늘은 채권관리 이야기를 합니다",
                [W(4.1, 4.4, "음"), W(4.5, 4.9, "오늘은"), W(5.0, 5.4, "채권관리"), W(5.5, 5.9, "이야기를 합니다")])
    return Transcript("ko", [a, b])


class FakeBackend:
    name = "fake"

    def __init__(self, tr):
        self.tr, self.calls = tr, 0

    def transcribe(self, samples, model):
        self.calls += 1
        return self.tr
