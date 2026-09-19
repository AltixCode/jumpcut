#!/usr/bin/env python3
"""Refuse a frame with a React Native LogBox toast on it.

    check-shot-logbox.py < tree.json      # an idb describe-all dump
    exit 0 = clean, 1 = a toast is on screen

Ata, looking at voicecrisp on the simulator: *"it has two ads and its covering
the button underneath"*. They are not ads. They are LogBox notifications:

    '!, Open debugger to view warnings.'
    '!, [RevenueCat] 🍎‼️ There was a problem with the App Store.'

sitting at y=828 and y=882, directly over "Unlock Lifetime Access - $3.99"
(y=791, h=56) and "Restore Purchases" (y=861). White bars at the bottom of a
dark screen read as ad slots, which is why they were reported as ads.

**LogBox is dev-only and cannot reach a release build**, so this is not a
shipped defect in the app. It IS a shipped defect in our SCREENSHOTS: every
capture runs against a debug build, so any warning raised during a pass lands in
the frame. **packpixel's live IAP review screenshot has two of them covering its
buy button** -- and they fooled check-iap-paywall.py into passing it at 95%,
because a white toast is a bright band exactly where a filled buy button would
be.

Detection is exact rather than visual: LogBox gives its toasts an accessibility
label beginning `"!, "`, which no app string does.
"""
from __future__ import annotations

import json
import sys

PREFIX = "!, "


def toasts(elements: list[dict]) -> list[str]:
    return [
        (e.get("AXLabel") or "").strip()
        for e in elements
        if (e.get("AXLabel") or "").strip().startswith(PREFIX)
    ]


def main() -> int:
    # An unreadable or empty tree is NO INFORMATION and must not be reported as
    # "no toast". `return 0` here meant the gate failed OPEN: 0 also means
    # "verified clean", so a caller could not tell a checked frame from an
    # unchecked one. A sibling gate was observed passing a frame on a 0-byte
    # dump because the device was mid-erase. An empty list is the same trap one
    # layer down: `[]` parses and sails through to a clean pass.
    try:
        els = json.load(sys.stdin)
    except Exception as err:
        print(f"NO-TREE  could not parse the dump ({err}) -- this is NOT a verdict")
        return 3
    if not isinstance(els, list) or not els:
        print("NO-TREE  the dump is empty -- no toast was looked for, "
              "this is NOT a verdict (was the device mid-erase?)")
        return 3
    found = toasts(els)
    if not found:
        print("ok       no LogBox toast on screen")
        return 0
    for t in found:
        print(f"LOGBOX   {t[:90]}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
