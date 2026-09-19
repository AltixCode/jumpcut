#!/usr/bin/env python3
"""Refuse a frame with the on-screen keyboard up.

    check-shot-keyboard.py <tree.json>     # reads an idb describe-all dump
    exit 0 = a readable tree with no keyboard in it
    exit 1 = the keyboard is up
    exit 3 = the tree could not be read, or was empty; NO VERDICT was reached

gridhabit uploaded a listing frame that was the half-open "New habit" FORM with
the iPad keyboard covering the bottom third and the real home screen dimmed
behind it. Every existing guard passed it: it is not a red box, not a system
dialog, not a duplicate, and a keyboard is DENSE so the content floor is
comfortably met. It is simply not a picture anyone would choose.

Any app with a text field can produce this, and a seed that types into one makes
it more likely rather than less -- the keyboard is still up when the seed ends.

Detection is by the keys themselves: a software keyboard puts dozens of
single-character elements in the tree, which no app screen does.
"""
from __future__ import annotations

import json
import sys

# Named keys are conclusive on their own; letters are the volume signal.
NAMED = {"shift", "delete", "space", "return", "more, numbers", "dictate",
         "emoji", "keyboard", "hide keyboard", "next keyboard"}
MIN_SINGLE_CHARS = 15


def keyboard_up(elements: list[dict]) -> tuple[bool, str]:
    labels = [(e.get("AXLabel") or "").strip() for e in elements]
    named = {l.lower() for l in labels} & NAMED
    singles = sum(1 for l in labels if len(l) == 1 and l.isalnum())
    if named and singles >= 5:
        return True, f"{singles} single-character keys plus {sorted(named)[:3]}"
    if singles >= MIN_SINGLE_CHARS:
        return True, f"{singles} single-character keys in the tree"
    return False, f"{singles} single-character labels, no keyboard"


def main() -> int:
    raw = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()

    # An unreadable or empty tree is NO INFORMATION, and must not be reported as
    # "no keyboard". This used to `return 0` on a parse failure, reasoning that a
    # broken dump should never reject a good frame -- correct intent, wrong exit
    # code, because 0 also means "verified clean" and the caller cannot tell them
    # apart. It failed OPEN, which for this gate is the one thing it cannot
    # afford: it exists because a listing frame was uploaded showing a half-open
    # form with the keyboard covering a third of the screen.
    #
    # Hit for real: a describe-all dump was 0 bytes because the device was
    # mid-erase, the gate returned 0, and the frame briefly read as cleared.
    # An empty list is the same trap one layer down -- `[]` parses fine and sails
    # through keyboard_up() to a clean pass.
    try:
        els = json.loads(raw)
    except Exception as err:
        print(f"NO-TREE  could not parse the dump ({err}) -- this is NOT a verdict")
        return 3
    if not isinstance(els, list) or not els:
        print("NO-TREE  the dump is empty -- no keyboard was looked for, "
              "this is NOT a verdict (was the device mid-erase?)")
        return 3

    up, why = keyboard_up(els)
    print(("KEYBOARD " if up else "ok       ") + why)
    return 1 if up else 0


if __name__ == "__main__":
    raise SystemExit(main())
