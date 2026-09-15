# JumpCut — handoff

Written 2026-09-15. Everything below was checked against the live consoles and
the repo on that date, not inferred.

**Where this app stands:** the code is done and verified on both platforms. It
cannot be submitted yet, and the reasons are mostly outside this repo — AdMob is
not configured for it, the legal URLs 404, and no build has ever been uploaded
to either store.

---

## Identifiers

| | |
|---|---|
| Bundle id / package | `com.altixcode.jumpcut` |
| App Store Connect app | `6811948269` (version 1.0, `PREPARE_FOR_SUBMISSION`) |
| In-app purchase | `com.altixcode.jumpcut.removeads` — ASC id `6811948910`, state `MISSING_METADATA` |
| RevenueCat project | `projc311586e` |
| RevenueCat apps | iOS `app7d7241cdb3` · Android `app197a3a330c` |
| RevenueCat entitlement | `remove_ads` — ✅ matches the code |
| Play Console | **no record / no bundle uploaded** |
| AdMob | nothing created |

---

## What is done

- **Ads**: AdMob banner + interstitial through the shared portfolio integration
  (`src/services/ads.ts`, `adPolicy.ts`, `adPacing.ts`, `adPacingFile.ts`,
  `consentPolicy.ts`, `src/store/adsStore.ts`, `src/components/AdBanner.tsx`).
  These files are byte-identical across the portfolio — change them in CapFlow
  and re-port with `Dev/scripts/port-ads.mjs`, never in one app alone.
- **Interstitial**: app/index.tsx — after a cut video is saved. Pacing lives in `adPolicy.ts`: the first completion
  is always clean, then every 2nd, minimum 90s apart, and never for a user who
  owns the upgrade. Counters persist across launches in `ad-pacing.json`.
- **Consent**: UMP → ATT → SDK init, in that order, failing closed. Ads start
  only once entitlement is known and only for users who have not paid, so a
  paying user never sees a GDPR form or an ATT prompt. A dev-only
  `[ads] consent {...}` line is logged; it is how the build harness proves the
  app reached the ads service.
- **Entitlement**: `remove_ads`, matching RevenueCat. One purchase removes the
  ads *and* unlocks the paid features.
- **Release gate**: `npm run check:release` refuses a build whose identifiers
  are absent, blank, or still a Google test unit. Nothing runs it automatically yet — this repo has no store-build workflow.
- **Tests**: 86 passing, typecheck clean.
- **Localization**: 12 locales — `ar` and `fa` are not present yet
- **CI**: `.github/workflows/ci.yml` runs typecheck, the test suite and both
  bundle exports.
- **Store build**: **this repo has no store-build workflow.** See the agent
  to-do list below.
- **Verified on device**: Android — built, installed, launched, consent
  resolved, and the AdMob test banner rendered anchored at the bottom with the
  layout intact. iOS — built, installed, launched, renders, consent flow
  reached.

---

## What is left that an agent can do

1. **Capture App Store screenshots.** None exist for this app. Both sizes are
   required: 6.9" iPhone (1320×2868) and 13" iPad (2064×2752). Use
   `Dev/scripts/store-screenshots.sh`, which drives the real app over its own
   fixtures. They land in `store/screenshots/iphone-6.9/` and
   `store/screenshots/ipad-13/`.

2. **Write and upload the store listing.** This app has no description and no
   keywords in App Store Connect, in any locale — the listing check fails on
   every one. The other apps carry 5 locales each in
   `Dev/scripts/store-metadata.json`; add an entry for JumpCut and upload it with
   `Dev/scripts/upload-store-metadata.mjs`. Limits: name 30, subtitle 30,
   keywords 100, Play title 30, short description 80.

3. **Add the store-build workflow.** This repo has CI but nothing that builds
   and uploads. Copy `deploy.yml` from any of netpulse, packpixel, signpure,
   redactpro, scribezero or storychop — it builds and signs with Xcode and
   Gradle directly (not EAS), uploads to TestFlight and Play, and already runs
   `npm run check:release` with the identifiers declared at workflow level.

4. **Upload the IAP review screenshot.** The in-app purchase
   (`com.altixcode.jumpcut.removeads`) is localized and priced at $3.99, and sits at
   `MISSING_METADATA` for want of one screenshot:

   ```bash
   asccli iap-review-screenshot upload --iap-id 6811948910 --file <path-to-png>
   ```

5. **Rename the purchase.** Its App Store display name and description still
   describe only half of what it does. One purchase removes the ads *and*
   unlocks the paid features, so both halves belong in the copy — something
   like "Pro — Ad-Free & Unlimited" (name ≤ 30 chars, description ≤ 45):

   ```bash
   asccli iap-localizations update --localization-id <id> \
     --name "Pro — Ad-Free & Unlimited" --description "<= 45 chars"
   ```

6. **Add `ar` and `fa`, then the RTL pass.** Deliberately left until last. The
   injector is `Dev/scripts/add-i18n-keys.mjs`, which refuses a partial locale
   set. `plugins/withAndroidRtl.js` is already wired.

---

## What only you can do

1. **AdMob — nothing exists for this app.** There is no write API at all; it is
   console-only. Create the app on both platforms, then banner and interstitial ad units,
   and note the ids. Answer **"No, not listed on a supported app store"** while
   the app is unpublished — linking later does not change the ids.

   Then publish a **GDPR message and a US-states message** under Privacy &
   messaging. The SDK can only present a message that exists, and this app fails
   closed on missing consent — so without them it shows **no ads at all** in the
   EEA. Expect "Requires review — limited ad serving" for a couple of days after
   the app goes live; that is not an integration bug.

2. **RevenueCat — Apple credentials.** `app7d7241cdb3` (the App Store app in project
   `projc311586e`) has no Apple credentials, so App Store purchases cannot be
   validated. This needs an interactive Apple ID sign-in with 2FA:

   ```bash
   rc setup apple app7d7241cdb3
   ```

   An App Store Connect *API* key can be set non-interactively; the separate
   **In-App Purchase key** cannot, which is why this one is yours.

3. **Create the GitHub repo first — there is none.** `git remote -v` is empty, so
   this code exists only on this machine: no CI has ever run, no secrets exist,
   and nothing is backed up. Create `AltixCode/jumpcut` and push, then add
   the signing secrets the other repos already carry (`APP_KEYSTORE_*`,
   `APP_STORE_CONNECT_API_KEY_*`, `PLAY_STORE_SERVICE_ACCOUNT_JSON`) plus these,
   without which CI now fails deliberately — a build missing one earns nothing
   while looking perfectly healthy:

   ```
   EXPO_PUBLIC_ADMOB_IOS_APP_ID
   EXPO_PUBLIC_ADMOB_ANDROID_APP_ID
   EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL
   EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL
   EXPO_PUBLIC_ADMOB_IOS_BANNER
   EXPO_PUBLIC_ADMOB_ANDROID_BANNER
   EXPO_PUBLIC_REVENUECAT_IOS_KEY
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
   ```

   Set each with `gh secret set <KEY> --repo AltixCode/jumpcut`. The RevenueCat
   public SDK keys are fetchable — `rc api GET "/projects/projc311586e/apps/app7d7241cdb3/public_api_keys"`
   — the AdMob ones come from step 1.

4. **The legal URLs are wrong and they 404.** `src/config/legal.ts` points at
   `https://www.hushtunnel.com/legal/jumpcut-privacy` — **hushtunnel.com**, a leftover from the HushTunnel
   template, not an AltixCode domain at all.

   Nothing is served there: altixcode.com only has `/legal/privacy`,
   `/legal/terms` and `/legal/cookies`. Both stores require a working privacy
   policy, the App Store record needs the same URL, and the policy text must now
   disclose that ads are served by Google AdMob and that ATT/UMP consent governs
   personalisation. Either publish per-app pages under altixcode.com or point
   `src/config/legal.ts` at the generic ones — either way the ads paragraph has to be
   written.

5. **Play Console — create the app.** `com.altixcode.jumpcut` is not recognised by
   the Publishing API, which means no app record exists or no bundle has ever
   been uploaded. A Play app has **no package name until its first bundle is
   uploaded**, and until then no in-app product can be created. The order is:
   create app → upload an AAB to internal testing → *then* create the product.
   Build that AAB from a non-production profile so internal testers generate no
   live impressions.

6. **App Store review contact.** No contact email or phone is set in App Store
   review information; the readiness check fails on it.

7. **The self-hosted macOS runner has been stopped since 2026-09-13** (it filled
   the disk). Every workflow in this repo targets it and queues indefinitely
   until it is back.

8. **No EAS project is linked.** `eas env:list` and any EAS build refuse with
   "EAS project not configured", and a robot token cannot configure it
   interactively — it needs `eas init --id <project-id> --non-interactive`, with
   `owner` and the project id then set by hand in the app config.

9. **Play Developer Reporting API is disabled** for project 1013025269741, so
   `gplay apps list` returns 403. The service account cannot enable it
   (`serviceusage.services.enable` is missing); it has to be enabled in the
   Cloud Console.

---

## Fixed recently — context for anything that looks odd

- **Privacy copy that ads made untrue.** Screens promising "no tracking" were
  corrected in every locale: the app's own content still never leaves the phone,
  but the ads do reach the internet and the copy now says so.
- The store description's PRIVACY paragraph now discloses that ads are served by
  Google AdMob and that the one-time purchase removes them.

---

## Traps already paid for — do not rediscover these

- **`react-native-google-mobile-ads` must stay pinned to exactly 16.3.4.** 16.4+
  pulls play-services-ads 25.3+, whose Kotlin 2.3.0 metadata SDK 57's Kotlin
  2.1.0 refuses to read. Forcing Kotlin up instead breaks `react-native-purchases`
  and `safe-area-context`.
- **iOS 26+ needs UIScene adoption** (`plugins/withIOSSceneLifecycle`). Without
  it the app installs, launches, and quits straight back to the home screen,
  with nothing on screen to explain why.
- **`JAVA_HOME` must be** `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`
  for any Android build. Gradle otherwise falls back to JDK 25 and CMake dies.
- **A missing identifier fails nothing.** The app falls back to Google's test ad
  units, works perfectly, and earns nothing. That is what `check:release` exists
  to stop.
- **`expo run:android` can fail in a second and leave the previous APK
  installed** — the app then launches, renders, and proves nothing. Check the
  build's own exit code before believing a screenshot.
- **Simulator.app is missing from this Xcode install**, so the ATT prompt cannot
  be dismissed on iOS. iOS verification ends at "builds, installs, launches,
  renders"; drive interaction on Android.

---

## Commands

```bash
npm run typecheck && npm test          # both clean as of 2026-09-15
npm run check:release                  # fails until the identifiers exist — correct
../scripts/verify-app.sh jumpcut com.altixcode.jumpcut   # full build + device verification, both platforms
```

The portfolio-wide notes live in `Dev/AGENTS.md`, and the store/console playbook
in `Dev/gridlock-pop/docs/mobile-playbook.md`. The shared ad integration is
ported by `Dev/scripts/port-ads.mjs` from CapFlow, which is the reference.

---

## One caution

Everything in this repo is **uncommitted**. Read `git status` before assuming
the working tree matches `main`.
