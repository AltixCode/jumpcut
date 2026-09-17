#!/usr/bin/env python3
"""Read an IAP review screenshot and judge what it SAYS.

    check-iap-text.py <frame.png>...
    exit 0 = every frame shows a real price and nothing incriminating
    exit 1 = at least one frame is not fit to send a reviewer

Every other gate here measures pixels, and all three defects that have actually
reached live App Store assets were text:

    poplet    a literal "All {total} levels" -- the placeholder never
              substituted, and no brightness threshold can see a brace
    quiktap   "[RevenueCat] Purchase was cancelled" drawn over Restore purchase
    knotter   "The store is not reachable right now. Check your connection and
              try again." exactly where the buy button belongs

`check-iap-paywall.py` measures the widest bright run in the lower half, which
catches a paywall with no filled button at all. It cannot catch the case that
prompted this file: a **filled button carrying no price**. capflow renders
"Unlock Lifetime Access" with the price omitted entirely when StoreKit has no
configuration -- no error banner, no missing button, nothing a pixel test can
object to. It simply does not say what the thing costs, which is the one fact
the reviewer is there to check.

The reading is done by the Vision framework via `scripts/tools/ocr`, which is
built from `ocr.swift` and needs no third-party OCR installed.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

OCR = Path(__file__).resolve().parent / "tools" / "ocr"

# The whole frame, not a band.
#
# This started as BAND = (0.45, 1.0), on the assumption that a purchase lives
# in a bottom-anchored sheet and that a price higher up is feature copy rather
# than a real offer. That is true of most of this portfolio and false of at
# least one app: gridlock-pop has no paywall screen at all -- its purchase is a
# row inside Settings at roughly y=0.30 -- so the gate reported NO-PRICE on a
# frame that plainly reads "Upgrade - $3.99". A gate that blocks correct work is
# not a safe gate; people start shipping past it, and then it stops being read.
#
# So the price may be anywhere, and the report says WHERE it was found instead
# of pretending to know what the layout should be. A price at the top of a
# frame is worth a human glance; it is not worth a refusal.
BAND = (0.0, 1.0)

# A price is a currency mark next to digits, in either order -- "$3.99",
# "3,99 €", "¥600". Kept deliberately loose: the question is whether the frame
# states a cost at all, not whether it matches a particular storefront.
PRICE = re.compile(r"(?:[$£€¥₩₪₹]\s?\d|\d[\d.,]*\s?(?:[$£€¥₩₪₹]|USD|EUR|GBP|JPY))")

# Phrases that disqualify a frame outright, whatever else is on it.
BAD_PHRASES = (
    "store is not reachable",
    "not reachable right now",
    "check your connection",
    "revenuecat",
    "purchase was cancelled",
    "open debugger",
    "unable to load",
    "try again later",
)

# An unsubstituted i18n placeholder: "{price}", "{total}", "%1$s".
PLACEHOLDER = re.compile(r"\{[a-zA-Z_][\w]*\}|%\d+\$[sd]")


def read(path: Path) -> list[str]:
    out = subprocess.run(
        [str(OCR), str(path), str(BAND[0]), str(BAND[1])],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or "ocr failed")
    lines = []
    for row in out.stdout.splitlines():
        parts = row.split(" ", 2)
        if len(parts) == 3:
            lines.append(parts[2])
    return lines


def judge(path: Path) -> list[str]:
    lines = read(path)
    if not lines:
        return ["no text read at all -- blank frame, or the band is wrong"]
    blob = " ".join(lines)
    low = blob.lower()

    faults = []
    for phrase in BAD_PHRASES:
        if phrase in low:
            faults.append(f'says "{phrase}"')
    for m in PLACEHOLDER.findall(blob):
        faults.append(f"unsubstituted placeholder {m}")
    if not PRICE.search(blob):
        faults.append("no price anywhere in the frame")
    return faults


def price_position(path: Path) -> float | None:
    """Where the price sits, 0.0 at the top. Reported, never judged."""
    out = subprocess.run(
        [str(OCR), str(path), "0.0", "1.0"], capture_output=True, text=True
    )
    for row in out.stdout.splitlines():
        parts = row.split(" ", 2)
        if len(parts) == 3 and PRICE.search(parts[2]):
            try:
                return float(parts[1])
            except ValueError:
                return None
    return None


def main() -> int:
    paths = [Path(a) for a in sys.argv[1:]]
    if not paths:
        print(__doc__.strip().splitlines()[1].strip())
        return 2
    if not OCR.exists():
        print(f"BUILD-ME  {OCR} is missing: swiftc -O ocr.swift -o ocr")
        return 2

    bad = 0
    for p in paths:
        try:
            faults = judge(p)
        except RuntimeError as err:
            print(f"ERROR    {p.name}: {err}")
            bad += 1
            continue
        if faults:
            bad += 1
            print(f"NO-PRICE {p.name}: " + "; ".join(faults))
        else:
            y = price_position(p)
            where = f" at y={y:.2f}" if y is not None else ""
            hint = "  <- high in the frame, worth a look" if (y or 0) < 0.35 else ""
            print(f"ok       {p.name}: price visible{where}, nothing incriminating{hint}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
