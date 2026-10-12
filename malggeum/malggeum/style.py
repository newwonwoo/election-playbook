"""레퍼런스 프로필 → 편집 프리셋. 값마다 '왜 그렇게 정했는지'를 함께 돌려줘서 사람이 확인할 수 있게 한다."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import points as P


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def merge(refs: list[dict]) -> dict:
    """여러 레퍼의 평균 프로필. 화면 비율은 가장 많은 쪽."""
    ok = [r for r in refs if r.get("status") == "indexed"]
    if not ok:
        raise ValueError("분석이 끝난 레퍼가 없어요")
    n = len(ok)
    m = {k: sum(r["metrics"][k] for r in ok) / n for k in ("shots_per_min", "silence_ratio")}
    fr_keys = {k for r in ok for k in ((r.get("clef") or {}).get("fractions") or {})}
    fr = {}
    for k in fr_keys:
        v = [r["clef"]["fractions"][k] for r in ok if k in ((r.get("clef") or {}).get("fractions") or {})]
        fr[k] = sum(v) / len(v)
    aspects = [r["aspect"] for r in ok]
    return {"n": n, "aspect": max(set(aspects), key=aspects.count), "duration": sum(r["duration"] for r in ok) / n,
            "metrics": m, "fractions": fr or None}


def to_preset(profile: dict, name: str) -> tuple[dict, list[str]]:
    why: list[str] = []
    m, fr = profile["metrics"], profile.get("fractions")
    vertical = profile["aspect"] == "9:16"
    spm = m["shots_per_min"]

    canvas = "9:16" if vertical else "16:9"
    why.append(f"화면 비율 {profile['aspect']} → 캔버스 {canvas}")

    zoom = spm >= 12 or (fr is not None and fr.get("zoom", 0) >= 0.4)
    zoom_every = round(_clip(60 / max(spm, 1.0), 2.5, 14.0), 1) if zoom else 12.0
    zoom_scale = 1.15 if (vertical or (fr and fr.get("closeup", 0) >= 0.6)) else 1.08
    why.append(f"컷 속도 분당 {spm:.0f}회" + (f"{', 줌 효과 비율 ' + format(fr['zoom'], '.0%') if fr and 'zoom' in fr else ''} → 줌 {'켬' if zoom else '끔'}"
                                            + (f", {zoom_every}초마다 {zoom_scale:.2f}배" if zoom else "")))

    sil = m["silence_ratio"]
    if sil < 0.04:
        opts = {"min_silence": 0.3, "pad": 0.08, "aggressive": True}
    elif sil < 0.12:
        opts = {"min_silence": 0.4, "pad": 0.12, "aggressive": False}
    else:
        opts = {"min_silence": 0.5, "pad": 0.15, "aggressive": False}
    why.append(f"무음 비율 {sil:.0%} → 무음 {opts['min_silence']}초 이상 컷, 여유 {opts['pad']}초" + (", 군말 공격적 제거" if opts["aggressive"] else ""))

    popup = fr.get("popup", 0.0) if fr else 0.0
    emphasis = (popup >= 0.3) if fr else True
    per_min = int(round(_clip(popup * 12, 3, 12))) if fr else (8 if vertical else 5)
    why.append((f"키워드 팝업 비율 {popup:.0%} → 팝업 {'켬' if emphasis else '끔'}" + (f", 분당 {per_min}개" if emphasis else "")) if fr
               else "AI 스타일 분석이 없어 팝업은 기본값(켬)")

    caps = fr.get("caps", 0.0) if fr else 0.0
    big = caps >= 0.5
    sub_size = (10.0 if vertical else 8.5) if big else (9.0 if vertical else 7.0)
    sub_chars = (12 if vertical else 16) if big else (14 if vertical else 20)
    why.append((f"큰 자막 비율 {caps:.0%} → 자막 {'크게' if big else '보통'}") if fr else "AI 스타일 분석이 없어 자막은 보통 크기")

    hook = (fr.get("hook", 0.0) >= 0.5) if fr and "hook" in fr else vertical
    why.append("오프닝에 핵심을 미리 보여줌 → 훅 켬" if hook and fr and "hook" in fr else ("훅 " + ("켬(숏폼 기본)" if hook else "끔")))

    chapters = (profile["duration"] >= 240) and not vertical
    why.append(f"길이 {profile['duration'] / 60:.1f}분 → 챕터 {'켬' if chapters else '끔'}")

    preset = {"label": f"레퍼 · {name}", "canvas": canvas, "custom": True,
              "features": {"hook": hook, "zoom": zoom, "emphasis": emphasis, "chapters": chapters, "loudness": True, "enhance": True},
              "zoom_every": zoom_every, "zoom_scale": zoom_scale, "emphasis_gap": round(_clip(60 / per_min * 0.8, 3.0, 12.0), 1),
              "emphasis_per_min": per_min, "min_chapter": 60 if chapters else 0, "sub_chars": sub_chars, "sub_size": sub_size,
              "options": opts}
    return preset, why


# ---- 저장소(사용자 프리셋) ---------------------------------------------------------------------
def load_custom(path: Path) -> int:
    """workspace/presets.json의 사용자 프리셋을 PRESETS에 등록."""
    try:
        d = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return 0
    for pid, p in d.items():
        P.PRESETS[pid] = p
    return len(d)


def save_custom(path: Path, pid: str, preset: dict) -> None:
    try:
        d = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        d = {}
    d[pid] = preset
    P.PRESETS[pid] = preset
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2), "utf-8")


def delete_custom(path: Path, pid: str) -> bool:
    try:
        d = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return False
    if pid not in d:
        return False
    d.pop(pid)
    P.PRESETS.pop(pid, None)
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2), "utf-8")
    return True


def auto_preset(refs: list[dict], ids: list[str]) -> tuple[str, dict, list[str]]:
    """새 작업을 레퍼에 맞출 때 쓰는 프리셋. 같은 레퍼 조합이면 같은 id(재사용·갱신), 내 스타일 목록에는 숨긴다."""
    prof = merge(refs)
    name = refs[0]["name"].rsplit(".", 1)[0] + (f" 외 {len(refs) - 1}개" if len(refs) > 1 else "")
    preset, why = to_preset(prof, name)
    preset.update(auto=True, refs=list(ids))
    pid = "refjob_" + hashlib.sha1(",".join(sorted(ids)).encode()).hexdigest()[:10]
    return pid, preset, why


def match_report(profile: dict, result: dict) -> list[dict]:
    """편집 결과가 레퍼 대비 얼마나 가까운지(컷 속도·팝업 빈도·길이). 정확한 일치가 아니라 방향 확인용."""
    out_d = max(result.get("out_duration") or 0.0, 1.0)
    shots = (len(result.get("keep") or []) + (result.get("point_counts") or {}).get("zoom", 0)) / out_d * 60
    pops = (result.get("point_counts") or {}).get("emphasis", 0) / out_d * 60
    rows = [{"label": "컷 속도(분당)", "ref": round(profile["metrics"]["shots_per_min"], 1), "mine": round(shots, 1)},
            {"label": "영상 길이(분)", "ref": round(profile["duration"] / 60, 1), "mine": round(out_d / 60, 1)}]
    fr = profile.get("fractions")
    if fr and "popup" in fr:
        rows.append({"label": "팝업 빈도(분당)", "ref": round(fr["popup"] * 12, 1), "mine": round(pops, 1)})
    for r in rows:
        hi = max(r["ref"], r["mine"], 1e-6)
        r["close"] = min(r["ref"], r["mine"]) / hi >= 0.6
    return rows
