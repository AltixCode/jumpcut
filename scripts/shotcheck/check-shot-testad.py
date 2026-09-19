#!/usr/bin/env python3
"""Refuse a frame showing an AdMob test advert or a debug badge.

    check-shot-testad.py <frame.png>...
    exit 0 = clean
    exit 1 = at least one frame shows a test advert
    exit 3 = the checker could not read a frame; no verdict was reached

A capture build must render no adverts at all: `isCaptureMode()` returns true
when `__DEV__ && EXPO_PUBLIC_CAPTURE_MODE === '1'`, and `shouldShowAds()`
returns false for it. When a frame is shot **without** that flag the AdMob test
unit renders instead, and it draws a literal **"Test mode"** badge over a
placeholder reading *"This is a 468x60 test ad"*.

That is worse than it sounds. A store screenshot showing a test advert tells a
reviewer the build was not a release build, and one has reached App Store
Connect before. It is also invisible to every other gate here: it is not a
LogBox toast, not a system dialog, not a back-link, and it is a legitimately
bright, legitimately wide element sitting exactly where a real advert would be —
so a brightness test reads it as normal chrome.

Found on a re-shot GridHabit iPad listing frame that had passed the back-link
gate cleanly. The fix is the capture flag, not the checker; this exists so the
mistake cannot be uploaded.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

OCR = Path(__file__).resolve().parent / "tools" / "ocr"

# Phrases only a non-release build can produce.
BAD = (
    "test mode",
    "test ad",
    "468x60",
    "320x50",
    "this is a test",
    "nice job!",  # the AdMob placeholder creative's own copy
)


def offences(path: Path) -> list[str]:
    out = subprocess.run(
        [str(OCR), str(path), "0.0", "1.0"], capture_output=True, text=True
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or "ocr failed")
    text = " ".join(
        row.split(" ", 2)[2]
        for row in out.stdout.splitlines()
        if len(row.split(" ", 2)) == 3
    ).lower()
    return [phrase for phrase in BAD if phrase in text]


def main() -> int:
    paths = [Path(a) for a in sys.argv[1:]]
    if not paths:
        print("usage: check-shot-testad.py <frame.png>...")
        return 2
    if not OCR.exists():
        print(f"BUILD-ME  {OCR} is missing: swiftc -O ocr.swift -o ocr")
        return 2

    bad = 0
    errors = 0
    for p in paths:
        try:
            hits = offences(p)
        except RuntimeError as err:
            print(f"ERROR    {p.name}: {err} -- the checker could not run, this is NOT a verdict")
            errors += 1
            continue
        if hits:
            bad += 1
            print(
                f"TEST-AD  {p.name}: shows {', '.join(repr(h) for h in hits)} "
                f"-- shot without EXPO_PUBLIC_CAPTURE_MODE=1, so AdMob served a test unit"
            )
        else:
            print(f"ok       {p.name}: no test advert")

    # Distinct exit codes, because "this frame is bad" and "I could not read the
    # frame" are different answers and a batch caller must be able to tell them
    # apart. Both are failures -- the gate fails closed either way -- but only
    # one of them means re-shoot. Vision has been observed failing under heavy
    # machine load (a CI build pinning the CPU), and on that machine every frame
    # reported an error, including ones it had passed an hour earlier.
    if errors:
        return 3
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
