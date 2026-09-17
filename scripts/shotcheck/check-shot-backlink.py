#!/usr/bin/env python3
"""Refuse a frame whose status bar carries a "< OtherApp" back-affordance.

    check-shot-backlink.py <frame.png>...
    exit 0 = clean, 1 = at least one frame shows a back-link

**knotter has one live**: its second iPad listing frame reads "< Foldup" in the
top-left, telling a reviewer the screenshot was taken by switching out of a
different app. It appears on the first relaunch after Metro switches apps; the
MacBook session's remedy is to relaunch twice before capturing.

No guard we have looks for it, and the reason is structural rather than an
oversight: it lives in the STATUS BAR, and every other check treats the status
bar as chrome and excludes it. It is not a duplicate, not a dialog, not a red
box and not sparse.

Detection: on a clean frame the top-left of the status bar holds the clock,
which is a compact run of glyphs near the left edge. A back-link puts a
triangle plus a word there, which is WIDER and starts further left. So the
measure is how far the ink in the status bar's left third extends.

**This is a screening tool, not a verdict.** A long clock format, a carrier
name, or a light-on-dark inversion can all move that number. Look at anything it
flags before deleting a frame.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "shotclean", Path(__file__).resolve().parent / "check-shot-clean.py"
)
_sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sc)

STATUS_TOP = 0.004   # skip the very top edge
STATUS_BOT = 0.030   # the status bar band
LEFT_THIRD = 0.33
INK_DELTA = 45.0     # how far a pixel must sit from the band's background


def backlink_width(path: Path) -> float:
    """Rightmost inked column in the status bar's left third, as % of width."""
    rows, w, h, ch = _sc.rows(path)
    y0, y1 = int(h * STATUS_TOP), int(h * STATUS_BOT)
    x1 = int(w * LEFT_THIRD)
    band = [rows[y][x * ch : x * ch + 3] for y in range(y0, y1) for x in range(0, x1, 2)]
    if not band:
        return 0.0
    lum = [0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] for p in band]
    bg = sorted(lum)[len(lum) // 2]
    rightmost = 0
    per_row = len(range(0, x1, 2))
    for i, L in enumerate(lum):
        if abs(L - bg) >= INK_DELTA:
            rightmost = max(rightmost, (i % per_row) * 2)
    return 100.0 * rightmost / w


# The ink measurement alone cannot tell a back-link from anything else wide in
# the status bar. A dimmed "<" chevron on the screen BEHIND a modal sheet reads
# as ink at the same width -- reported from a real frame, gridhabit-ipad's IAP
# shot, which the measurement flagged and which is clean.
#
# So the measurement is now a pre-filter and the verdict comes from reading the
# strip. A genuine back-link renders as its own text run before the clock:
#
#   real       ["• CapFlow", "9:41AM Wed 16 Sep", "GridHabit"]
#   clean      ["09:41 Thu 17 Sep GridHabit"]
#
# If the OCR helper is not built, the measurement stands on its own and says so
# rather than silently passing everything.
import re as _re
import subprocess as _sp

_OCR = Path(__file__).resolve().parent / "tools" / "ocr"
_LEADER = _re.compile(r"^\s*[•◀◄‹<❮]")


def _status_bar_runs(path: Path) -> list[str] | None:
    if not _OCR.exists():
        return None
    out = _sp.run([str(_OCR), str(path), "0.0", "0.025"], capture_output=True, text=True)
    if out.returncode != 0:
        return None
    runs = []
    for row in out.stdout.splitlines():
        parts = row.split(" ", 2)
        if len(parts) == 3 and parts[2].strip():
            runs.append(parts[2].strip())
    return runs


def confirms_backlink(path: Path) -> bool | None:
    """True = a back-link is readable, False = the strip is clean, None = cannot tell."""
    runs = _status_bar_runs(path)
    if runs is None:
        return None
    # A leader followed by an app NAME. "• 100" is a battery percentage on the
    # right-hand side of the strip, not a back-link, and it flagged a clean
    # HushTunnel frame.
    for r in runs:
        if _LEADER.match(r):
            rest = _LEADER.sub("", r).strip()
            if rest and not rest.isdigit():
                return True
    # A second signal for when the chevron does not survive OCR: a run that
    # precedes the clock and is not itself clock-shaped.
    non_clock = [r for r in runs if not _re.match(r"^\d", r)]
    return len(runs) > 1 and len(non_clock) >= 2


def main() -> int:
    bad = 0
    for arg in sys.argv[1:]:
        p = Path(arg)
        try:
            width = backlink_width(p)
        except Exception as exc:  # noqa: BLE001
            print(f"?        {p.name}: cannot read ({exc})")
            continue
        # Threshold sits in the GAP of a measured bimodal distribution, not
        # beside the clean cluster. Across 66 locally captured frames:
        #
        #     clean       21.2 - 23.7%   (clock, or clock + date on iPad)
        #     back-link   29.9 - 32.5%
        #
        # Nothing landed between 23.7 and 29.9, and two of the high cluster were
        # confirmed by eye: gridhabit's iPad frame reads "< CapFlow" and
        # convertwise's reads "< Dicewit". 27% is the middle of that gap. An
        # earlier 24% was a point away from the clean cluster's top, which is
        # where a threshold gets it wrong.
        if width >= 27.0:
            confirmed = confirms_backlink(p)
            if confirmed is True:
                runs = _status_bar_runs(p) or []
                print(f"BACKLINK {p.name}: status bar reads {runs!r} -- "
                      f"captured by switching out of another app")
                bad += 1
            elif confirmed is False:
                print(f"ok       {p.name}: ink reaches {width:.0f}% but the strip reads "
                      f"clean -- something wide behind a sheet, not a back-link")
            else:
                print(f"BACKLINK {p.name}: ink in the status bar reaches {width:.0f}% "
                      f"of the width -- likely a '< OtherApp' affordance beside the "
                      f"clock (unconfirmed: build tools/ocr to be sure)")
                bad += 1
        else:
            print(f"ok       {p.name}: status-bar ink stops at {width:.0f}%")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
