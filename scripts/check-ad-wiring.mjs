#!/usr/bin/env node
/**
 * Refuses an app that sells the removal of an ad it never shows.
 *
 * The paywall's first claim is, in every app here, "The banner and the
 * full-screen ad are gone for good." That is a claim the buyer pays for. Six
 * apps shipped it while their interstitial branch was dead, and a seventh
 * preloaded an interstitial on every launch with no call site at all — an ad
 * request with a 0% impression rate, which is AdMob's problem with us as well
 * as the buyer's.
 *
 * Nothing caught it. Every one of those apps has a PASSING `adPolicy.test.ts`,
 * because the policy function was never wrong: it was handed a constant that
 * its own minimum rejects. A unit test cannot see its own call site, so this
 * checks the call site.
 *
 * Two failures, both about wiring rather than logic:
 *
 *  1. `showInterstitial` is imported or preloaded but never invoked.
 *  2. `shouldShowInterstitial` is handed a numeric literal for the play count
 *     that can never clear `MIN_GAMES_BEFORE_FIRST_INTERSTITIAL`.
 *
 * Usage: node scripts/check-ad-wiring.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEARCH = ['app', 'src'];
const SKIP = new Set(['node_modules', '__tests__', '__mocks__']);

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
};
for (const dir of SEARCH) {
  const full = path.join(root, dir);
  if (fs.existsSync(full)) walk(full);
}

const problems = [];
const rel = (f) => path.relative(root, f);

/** The module that defines the helpers cannot count as a caller of them. */
const isDefinition = (file) => /(monetization|services)[/\\](interstitial|ads)\.tsx?$/.test(file);

let showCallers = 0;
let preloadCallers = 0;
let policyCallSites = 0;

// The app's own minimum, read rather than assumed: a fork may raise it, and a
// hardcoded 2 here would then miss the very defect this exists to catch.
let minimum = 2;
for (const file of files) {
  const m = fs
    .readFileSync(file, 'utf8')
    .match(/MIN_GAMES_BEFORE_FIRST_INTERSTITIAL\s*=\s*(\d+)/);
  if (m) minimum = Number(m[1]);
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  // Strip imports so `import { showInterstitial }` is not read as a call.
  const body = source.replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?$/gm, '');

  if (!isDefinition(file)) {
    if (/\bshowInterstitial\s*\(/.test(body)) showCallers += 1;
    if (/\bpreloadInterstitial\s*\(/.test(body)) preloadCallers += 1;
  }

  const calls = body.matchAll(/shouldShowInterstitial\s*\(\s*\{([\s\S]{0,400}?)\}\s*\)/g);
  for (const call of calls) {
    policyCallSites += 1;
    const args = call[1];
    const count = args.match(/\b(?:gamesPlayed|completions|plays|runs)\s*:\s*(\d+)\b/);
    if (count && Number(count[1]) <= minimum) {
      problems.push(
        `${rel(file)}: the play count is the literal ${count[1]}, and the policy refuses ` +
          `anything at or below ${minimum} — this interstitial can never show, ` +
          `while the paywall sells its removal.`,
      );
    }
  }
}

if (preloadCallers > 0 && showCallers === 0) {
  problems.push(
    'an interstitial is preloaded but never shown: every launch makes an ad request ' +
      'that can never become an impression, and the paywall sells the removal of an ad ' +
      'the player will never see.',
  );
}
if (policyCallSites > 0 && showCallers === 0) {
  problems.push(
    'shouldShowInterstitial is consulted but showInterstitial is never called — ' +
      'the decision is computed and thrown away.',
  );
}

if (problems.length) {
  console.error(`check-ad-wiring: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nEither wire the ad up so the claim is true, or cut the interstitial AND the\n' +
      'sentence on the paywall that promises its removal. A passing adPolicy test does\n' +
      'not mean the ad reaches the screen; it only means the policy function is correct\n' +
      'about the arguments it was given.',
  );
  process.exit(1);
}
console.log(
  `check-ad-wiring: the interstitial is reachable (${showCallers} call site(s), ` +
    `${policyCallSites} paced decision(s)).`,
);
