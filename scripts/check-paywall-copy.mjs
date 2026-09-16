#!/usr/bin/env node
/**
 * Refuses paywall copy that still describes the template rather than this app.
 *
 * `_template` ships "Everything unlocked — every level, every mode and the full
 * archive" and "new content is added regularly and is always included". Most
 * apps generated from it have no modes, no archive, or no content pipeline, so
 * those sentences are false — and unlike a wrong screenshot they are a **paid**
 * claim, which makes them a refund and a store-review problem rather than only
 * an accuracy one.
 *
 * Nothing else catches this: the strings are present in all fourteen locales,
 * so check:i18n passes, and no test asserts that copy is true.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where the claims live.
 *
 * Most apps keep them in `src/i18n/index.ts` under `feat*` keys. Some do not:
 * a single-language app can hardcode the sentences straight into the paywall
 * screen, and requiring the i18n file meant such an app was silently exempt —
 * a paywall no gate could read, reported as nothing at all. So fall back to
 * the screen itself and match on the sentences rather than the keys.
 */
/*
 * Every source is read, not the first one that exists.
 *
 * This returned on the first match, and gridhabit is the app that shows why
 * that is wrong: it has an `app/paywall.tsx`, so the search stopped there --
 * while its actual claims ("Unlock unlimited habits, no ads, and everything
 * else -- forever", "Export your full history as CSV or JSON") live in
 * `src/monetization/entitlements.ts` and reach the screen through
 * `{paywallReasonFor(reason)}`. The gate read the file the claims were not in,
 * found nothing to object to, and passed.
 *
 * Claims are not required to live in one place, so asking "which file holds
 * them" is the wrong question. Read them all and concatenate.
 */
function paywallSource() {
  const parts = [];
  let keyed = false;

  const i18n = resolve(ROOT, 'src/i18n/index.ts');
  if (existsSync(i18n)) {
    const source = readFileSync(i18n, 'utf8');
    /*
     * The English block is the one an author edits; the rest follow from it.
     *
     * Both quoting styles, because eleven apps write `"en": {` and this used to
     * split on the literal `  en: {`. For those the split found nothing, `en`
     * came back empty, `keyed` stayed false, and the gate fell through to
     * `paywall.tsx` -- which renders `t('feat2Desc')` rather than the sentence,
     * so the sentence match found nothing either and the app passed by being
     * unreadable at every step.
     *
     * That is the third tool broken by this one assumption (check-i18n and
     * add-i18n-keys.mjs were the others), and the second place inside THIS
     * file: the key pattern below had it too.
     */
    const open = source.match(/^\s*["']?en["']?\s*:\s*\{/m);
    const rest = open ? source.slice(open.index + open[0].length) : '';
    const close = rest.match(/^\s*["']?[a-z]{2}(-[A-Z]{2})?["']?\s*:\s*\{/m);
    const en = close ? rest.slice(0, close.index) : rest;
    if (en) {
      parts.push(en);
      keyed = true;
    }
  }

  for (const rel of [
    'app/paywall.tsx',
    'src/screens/PaywallScreen.tsx',
    // A helper that builds the sentences is still the paywall's copy, and it is
    // invisible to check-ui-rules as well: that gate only matches literals
    // written at the call site, never one arriving via `{someHelper(x)}`.
    'src/monetization/entitlements.ts',
  ]) {
    const file = resolve(ROOT, rel);
    if (existsSync(file)) parts.push(readFileSync(file, 'utf8'));
  }

  if (parts.length === 0) return null;
  return { text: parts.join('\n'), keyed };
}

const found_source = paywallSource();
if (found_source === null) {
  console.log('check-paywall-copy: no paywall copy found — nothing to check.');
  process.exit(0);
}
const en = found_source.text;

const TEMPLATE_DEFAULTS = [
  ['feat2Desc', 'Every level, every mode and the full archive, at your own pace.'],
  ['feat2Title', 'Everything unlocked'],
  ['feat3Title', 'Your progress stays on the device'],
  ['feat4Desc', 'New content is added regularly and is always included.'],
];

const found = TEMPLATE_DEFAULTS.filter(([key, value]) => {
  if (!found_source.keyed) {
    // Hardcoded copy has no keys to look up, so the sentence itself is the
    // match. Same claim, same verdict, wherever it is written.
    return en.includes(value);
  }
  // Both quoting styles. Eleven apps write `"feat2Desc": "..."` -- capflow,
  // jumpcut, netpulse, packpixel, redactpro, scribezero, signpure, slideforge,
  // storychop, syncprompt, voicecrisp -- and a single-quote-only pattern finds
  // nothing in them, so the gate passed by being unable to look. Their copy is
  // genuinely customised, so nothing false was shipping; the gate simply could
  // not have told us if it had been.
  //
  // This is the same assumption that broke check-i18n for those apps and
  // add-i18n-keys.mjs for 31 of 42. Three tools, one belief about quoting,
  // and every time it under-reported in a way indistinguishable from a pass.
  const match = en.match(new RegExp(`["']?${key}["']?\\s*:\\s*(['"])([^'"]*)\\1`));
  return match && match[2] === value;
});

if (found.length) {
  console.error('check-paywall-copy: these still carry the template default:\n');
  for (const [key, value] of found) console.error(`  ${key}  "${value}"`);
  console.error('\nEach is a claim the buyer pays for. Rewrite them to what THIS app');
  console.error('unlocks — checked against its own source, not what would sell well —');
  console.error('in all fourteen locales. If a claim cannot be made honestly, cut the');
  console.error('feature and the claim.');
  process.exit(1);
}
console.log('check-paywall-copy: the paywall describes this app, not the template.');
