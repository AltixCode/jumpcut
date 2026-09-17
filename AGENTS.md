# Jumpcut — agent notes

Written 2026-09-17. This repo had no AGENTS.md; the portfolio-wide rules live in
the Dev workspace at `AGENTS.md` and `docs/agents/`, and the ones below are the
ones that have actually cost this portfolio something.

## Non-negotiables

1. **Nothing is faked.** A feature is genuinely implemented on device or it does
   not exist — in code, in the UI, in store metadata, or in a status report.
   Store enforcement is account-level: one deceptive app can take the whole
   portfolio down.
2. **A store screenshot is reviewed by a human, so look at it.** No frame whose
   status bar reads `◀ OtherApp` ever reaches a listing — it tells a reviewer
   this app was captured by switching out of another of ours, which on a
   portfolio already rejected under Guideline 4.3(a) Design Spam is evidence for
   the accusation. One reached a live iPad listing, alongside an on-screen
   keyboard over 40% of the frame and an empty form field. Every other gate
   treats the status bar as chrome and excludes it, so:

       python3 scripts/shotcheck/check-shot-backlink.py <frame.png>...

   Read **all** of its output and the checker's own exit code, never one piped
   through `tail`. Then open the image. Also disqualifying: a system alert
   covering the app, a LogBox toast, and an IAP frame whose buy button carries
   no price — `scripts/shotcheck/check-iap-text.py` reads the frame for that.
3. **A build is not a verification.** `tsc`, `expo export` and `xcodebuild` all
   pass on an app that dies before its first frame. Proof is the artifact.
   Unverified is `UNKNOWN`, never a pass.
4. **Never hand-edit `ios/` or `android/`.** `expo prebuild` regenerates them.
5. **No secret in the repo.** Credentials come from GitHub Actions secrets or
   the shell profile.

## Capturing a paywall

A StoreKit configuration **cannot** reach an `expo run:ios` + `simctl launch`
pipeline: Xcode applies one by syncing it to the device as part of running a
scheme, and `simctl` has no equivalent. So the paywall renders its unavailable
state and the screenshot shows a broken purchase. Set
`EXPO_PUBLIC_CAPTURE_PRICE` from this repo's `scripts/iap.json` — which carries
this product's **real** price from App Store Connect — and the capture-mode
fallback supplies it. The pipeline used to hardcode $4.99 for every app; exactly
one app in the fleet is $4.99.

## Build from `origin/main`

`/Volumes/Dev/mobile_expo_apps/jumpcut` is a shared working tree sitting on whatever
branch someone last left it on. A QA pass built from it once measured a defect
that had been fixed hours earlier. Clone instead:

    gh repo clone AltixCode/jumpcut -- --depth 1

## Commands

    npm test            # jest, all of it
    npx tsc --noEmit    # types
    npm run check:ui    # the UI rules, where this repo has them
