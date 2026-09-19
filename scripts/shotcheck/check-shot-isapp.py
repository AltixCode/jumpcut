#!/usr/bin/env python3
"""Refuse a frame that is not the app it claims to be.

    check-shot-isapp.py <expected-app-name> <frame.png>...
    exit 0 = every frame's status bar names the expected app
    exit 1 = at least one frame is a different app, or the home screen
    exit 3 = the checker could not read a frame; NO VERDICT was reached

**A voicecrisp listing frame turned out to be the iOS home screen** — widgets,
Files, Reminders, Maps, the dock — sitting on the share ready to upload as an
App Store screenshot. It passed every other gate we have: correct size, no
back-link, no test advert, no dialog, no keyboard. SpringBoard is a legitimate,
dense, clean screen; it simply is not our app.

The same shape has produced a wrong answer three times: a layout sweep measured
SpringBoard and reported it as jumpcut ("body column 1012pt, cap NOT APPLIED"),
an app exited before a measurement and the tooling described whatever replaced
it, and now a capture. Nothing we had asks the one question that matters first:
**is this our app at all?**

On iPad the status bar carries the foreground app's name, which is what this
reads. On the home screen there is no app name, only the clock and date — so
absence is as conclusive as a mismatch.

**iPhone has no such name in the status bar**, so this cannot be used there.
For an iPhone capture the equivalent check is the one `capture-pass.sh` already
does at capture time: read the Application element's own label from the
accessibility tree and refuse on a mismatch. Afterwards, the evidence is gone.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

OCR = Path(__file__).resolve().parent / "tools" / "ocr"

# The status bar strip. The app name sits beside the clock and date.
BAND = (0.0, 0.03)

# Words that appear in a status bar and are never an app name.
CHROME = re.compile(
    r"^(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"
    r"|am|pm)$",
    re.I,
)


def status_bar_words(path: Path) -> list[str]:
    out = subprocess.run(
        [str(OCR), str(path), str(BAND[0]), str(BAND[1])],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or "ocr failed")
    words: list[str] = []
    for row in out.stdout.splitlines():
        parts = row.split(" ", 2)
        if len(parts) != 3:
            continue
        for w in parts[2].split():
            w = w.strip(".,·•'’")
            if not w or w[0].isdigit() or CHROME.match(w):
                continue
            words.append(w)
    return words


def names_app(path: Path, expected: str) -> tuple[bool, str]:
    words = status_bar_words(path)
    if not words:
        # No app name at all. On iPad that is the home screen, a system sheet,
        # or a frame with no foreground app -- never one of ours.
        return False, "no app name in the status bar (home screen or system UI?)"
    squashed = "".join(words).lower().replace(" ", "")
    want = expected.lower().replace(" ", "").replace("-", "")
    if want in squashed:
        return True, f"status bar names {words!r}"
    return False, f"status bar names {words!r}, expected {expected!r}"


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: check-shot-isapp.py <expected-app-name> <frame.png>...")
        return 2
    if not OCR.exists():
        print(f"BUILD-ME  {OCR} is missing: swiftc -O ocr.swift -o ocr")
        return 2

    expected = sys.argv[1]
    bad = errors = 0
    for arg in sys.argv[2:]:
        p = Path(arg)
        try:
            ok, why = names_app(p, expected)
        except RuntimeError as err:
            print(
                f"ERROR     {p.name}: {err} -- the checker could not run, NOT a verdict"
            )
            errors += 1
            continue
        if ok:
            print(f"ok        {p.name}: {why}")
        else:
            bad += 1
            print(f"NOT-APP   {p.name}: {why}")
    if bad:
        return 1
    return 3 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
