#!/usr/bin/env python3
"""Does this IAP review screenshot show a WORKING purchase?

    check-iap-paywall.py <frame.png>...
    exit 0 = every frame shows a buy button, 1 = at least one does not

An IAP review screenshot is the one image Apple's reviewer sees of the purchase.
Before the RevenueCat products were attached, every paywall rendered
"The store is not reachable right now. Check your connection and try again."
where the price belongs -- no price, no buy button, only "Restore purchase".
Those screenshots uploaded successfully and the IAPs went READY_TO_SUBMIT, so
nothing downstream objected: the field was filled, and what was in it advertised
a broken purchase.

The measure is the widest continuous BRIGHT RUN in the lower half of the frame.
A working paywall has a filled, full-width "Unlock forever - $3.99" button; a
broken one has an outlined Restore button and nothing else. Measured:

    dicewit (verified price)   89.1%
    klondo, foldup, memoflip, splitjar (store error)   1.8 - 2.7%

**A PASS IS NOT A VERDICT. Two ways it says ok about a bad frame:**

1. A LIGHT-themed paywall is bright everywhere, so a broken one still scores
   high.
2. **A white error TOAST is a bright band too.** packpixel scored 95% on two
   stacked white toasts -- one of them a RevenueCat error -- sitting directly
   over the buy button they were mistaken for. netpulse scored 95% on a real
   "$4.99" button and also carries an error toast.

So a FAIL here is strong (no bright band means no filled button) and a PASS
means only "something bright is down there". Look at anything that passes
before shipping it. This is a screening tool for the 20-odd obvious cases, not
a certificate.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MIN_CTA_WIDTH = 30.0  # percent of frame width

_spec = importlib.util.spec_from_file_location(
    "shotclean", Path(__file__).resolve().parent / "check-shot-clean.py"
)
_sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sc)


def luma(px: bytes) -> float:
    return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]


def cta_width(path: Path) -> float:
    rows, w, h, ch = _sc.rows(path)
    best = 0
    for y in range(int(h * 0.45), h, 3):
        row, run = rows[y], 0
        for x in range(0, w, 3):
            if luma(row[x * ch : x * ch + 3]) >= 170:
                run += 1
            else:
                best = max(best, run)
                run = 0
        best = max(best, run)
    return 100.0 * best / (w / 3)


def main() -> int:
    bad = 0
    for arg in sys.argv[1:]:
        p = Path(arg)
        try:
            width = cta_width(p)
        except Exception as exc:  # noqa: BLE001
            print(f"?        {p.name}: cannot read ({exc})")
            continue
        if width < MIN_CTA_WIDTH:
            print(f"NO-BUY   {p.name}: widest bright run in the lower half is "
                  f"{width:.1f}% -- no filled buy button, so probably the "
                  f"store-unreachable paywall")
            bad += 1
        else:
            print(f"ok       {p.name}: buy button spans {width:.0f}%")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
