#!/usr/bin/env node
/**
 * Fails if any locale is missing a key that English defines, or defines one
 * English does not.
 *
 * A missing key is invisible at runtime — `t()` falls back to English and the
 * screen still renders — so nothing but a check like this catches a locale that
 * quietly stopped being translated. Plural variants (`key_one`, `key_few`, …)
 * are exempt from the "extra key" rule, because a language legitimately needs
 * forms that English does not have.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/i18n/index.ts'), 'utf8');

const blocks = {};
// Quoted OR unquoted locale keys. This required `  en: {` and a dozen apps --
// netpulse, packpixel, redactpro, scribezero, signpure, storychop and the rest
// of the non-game half -- write `  "en": {`. On those the gate found no blocks,
// said "could not read the English block" and exited 1, which is why nobody
// simply added it to them: it looked broken rather than mis-tuned. The same
// assumption was in add-i18n-keys.mjs and had silently disabled that tool for
// 31 apps.
const blockRe = /^ {2}"?([a-z]{2})"?: \{$/gm;
let match;
const starts = [];
while ((match = blockRe.exec(source))) starts.push({ lang: match[1], index: match.index });

starts.forEach(({ lang, index }, i) => {
  const end = i + 1 < starts.length ? starts[i + 1].index : source.indexOf('\n} as const;');
  const body = source.slice(index, end);
  const keys = new Set();
  for (const m of body.matchAll(/^ {4}"?([A-Za-z0-9_]+)"?:/gm)) keys.add(m[1]);
  blocks[lang] = keys;
});

const en = blocks.en;
if (!en || en.size === 0) {
  console.error('check-i18n: could not read the English block');
  process.exit(1);
}

const base = [...en].filter((k) => !/_(?:zero|one|two|few|many|other)$/.test(k));
const problems = [];

for (const [lang, keys] of Object.entries(blocks)) {
  if (lang === 'en') continue;
  const missing = base.filter((k) => !keys.has(k));
  const extra = [...keys].filter(
    (k) => !en.has(k) && !/_(?:zero|one|two|few|many|other)$/.test(k),
  );
  if (missing.length) problems.push(`${lang}: missing ${missing.length} → ${missing.join(', ')}`);
  if (extra.length) problems.push(`${lang}: unknown key(s) → ${extra.join(', ')}`);
}

const expected = 14;
if (Object.keys(blocks).length !== expected) {
  problems.push(`found ${Object.keys(blocks).length} locales, expected ${expected}`);
}

if (problems.length) {
  console.error(`check-i18n: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}

console.log(`check-i18n: ${Object.keys(blocks).length} locales × ${base.length} keys — complete`);
