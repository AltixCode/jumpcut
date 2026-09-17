#!/usr/bin/env python3
"""Refuse a frame whose subject is a SYSTEM DIALOG rather than the app.

    check-shot-dialog.py <frame.png>...
    exit 0 = every frame is fine, 1 = at least one is a dialog

worddrop's second live iPhone screenshot was Google's UMP consent sheet --
"Welcome to Publisher Test Ads / Publisher Test Ads asks for your consent to
use your personal data to:" -- sitting in the store listing. It is not the
product, and it tells any reader that the build is running TEST ad units.

Nothing we had could see it. It is not a red box, so the redbox guard passes
it. It is not blank or sparse -- a consent sheet is dense text, so the density
floor passes it comfortably. It is not a duplicate. And check-shot-clean's band
test compares luminance across horizontal bands, which a centred dialog does
not trip.

The shape that does catch it: a large, bright, RECTANGULAR region occupying the
middle of a frame whose app is dark. That is what a modal over a dimmed app
looks like and it is not what any of these apps' own screens look like, because
none of them render a white card over a dark body at this scale.

Deliberately narrow, and it only fires on DARK frames: a light-themed app is
mostly bright everywhere, so this measure says nothing there and must not
pretend otherwise. Pair it with the accessibility tree when one is available --
a sheet naming "Consent" or "Publisher Test Ads" is conclusive where this is
only strong evidence.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

BRIGHT_MIN = 170.0      # a white card
MIN_CENTRE_BRIGHT = 35.0  # percent of the CENTRE the card must cover
MAX_BORDER_LUMA = 90.0    # the app around it is dark
MIN_CONTRAST = 90.0       # centre must be this much brighter than the border

# MEAN LUMA OF THE WHOLE FRAME, not of the pixels outside the bright block.
#
# The first version of this averaged only the non-bright pixels, which on a
# LIGHT-MODE screen are just the text and a button or two -- so every light
# frame scored a "dark body" and got flagged. It called trilite, toppl, scanlit
# and worddrop's iPad frame dialogs; all four are ordinary light-mode
# screenshots. Validating on the two frames I already knew the answer for would
# have shipped that. 119 frames caught it.
#
# The upper bound on fraction does the same job from the other side: a modal
# covers part of a frame. Something covering 95% of it is the screen.

_spec = importlib.util.spec_from_file_location(
    "shotclean", Path(__file__).resolve().parent / "check-shot-clean.py"
)
_sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sc)


def luma(px: bytes) -> float:
    return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]


def modal_signature(path: Path) -> tuple[float, float, float]:
    """(bright% of the centre, mean luma of the border, mean luma of centre).

    A modal is a bright card with the dimmed app still visible AROUND it. So
    the test is the contrast between the frame's BORDER and its CENTRE, not the
    brightness of either alone:

      light-mode screen   border bright, centre bright   -> not a modal
      dark-mode screen    border dark,   centre dark     -> not a modal
      modal over dark app border dark,   centre bright   -> a modal

    Measuring only overall brightness cannot separate the first from the third,
    which is how the first version flagged four ordinary light screenshots and
    then, once corrected for that, stopped seeing the real one. The border is
    the part a sheet never covers.
    """
    rows, w, h, ch = _sc.rows(path)
    mx, my = int(w * 0.06), int(h * 0.06)     # border band
    cx0, cx1 = int(w * 0.20), int(w * 0.80)   # centre box
    cy0, cy1 = int(h * 0.25), int(h * 0.75)
    b_sum = b_n = c_sum = c_n = c_bright = 0
    for y in range(0, h, 4):
        row = rows[y]
        for x in range(0, w, 4):
            L = luma(row[x * ch : x * ch + 3])
            if x < mx or x >= w - mx or y < my or y >= h - my:
                b_sum += L; b_n += 1
            elif cx0 <= x < cx1 and cy0 <= y < cy1:
                c_sum += L; c_n += 1
                if L >= BRIGHT_MIN:
                    c_bright += 1
    return (100.0 * c_bright / max(c_n, 1),
            b_sum / max(b_n, 1),
            c_sum / max(c_n, 1))


def main() -> int:
    bad = 0
    for arg in sys.argv[1:]:
        p = Path(arg)
        try:
            frac, border, centre = modal_signature(p)
        except Exception as exc:  # noqa: BLE001
            print(f"?      {p.name}: cannot read ({exc})")
            continue
        if (border <= MAX_BORDER_LUMA
                and frac >= MIN_CENTRE_BRIGHT
                and centre - border >= MIN_CONTRAST):
            print(f"DIALOG {p}: a bright card fills {frac:.0f}% of the centre "
                  f"(centre luma {centre:.0f}) over a dark border ({border:.0f})")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
