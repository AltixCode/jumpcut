# Screenshot gates

Copies of the portfolio screenshot checks, committed here so a capture machine
needs only a `gh repo clone` — no SMB share. The share has gone down twice and
each time it silently disarmed the capture pipeline rather than failing loudly,
which is the worst way for a check to be unavailable.

    python3 scripts/shotcheck/check-shot-backlink.py frame.png   # "< OtherApp" in the status bar
    python3 scripts/shotcheck/check-shot-clean.py    frame.png   # bright bands, sparse frames
    python3 scripts/shotcheck/check-shot-dialog.py   frame.png   # system alert over the app
    python3 scripts/shotcheck/check-iap-paywall.py   frame.png   # is there a filled buy button
    python3 scripts/shotcheck/check-iap-text.py      frame.png   # does it SAY a price

`check-iap-text.py` is the only one that reads text rather than pixels, and it
is the only one that can catch a filled purchase button with no price beside
it. It needs the Vision-based OCR helper built once:

    cd scripts/shotcheck/tools && swiftc -O ocr.swift -o ocr

The canonical copies live in `Dev/scripts/`. Prefer these when the share is
unreachable, which is most of the time.
