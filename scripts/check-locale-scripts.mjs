#!/usr/bin/env node
/**
 * Refuses a translated string that mixes writing systems.
 *
 * `check-i18n` proves every key exists in all fourteen locales. It says nothing
 * about whether a *value* is in the right language, and a string with Cyrillic
 * spliced into the middle of a Japanese sentence — `解放で全日открыты` — passes
 * every other gate this portfolio has. It is gibberish to a reader and there is
 * no test that would notice, because no test reads.
 *
 * This is deliberately narrow. It does not judge translation quality or check
 * that `ja` contains Japanese; it only catches the failure that actually
 * happened: two scripts fused inside one string.
 *
 *   node scripts/check-locale-scripts.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(ROOT, 'src/i18n/index.ts'), 'utf8');

const SCRIPTS = {
  Cyrillic: /[Ѐ-ӿ]/,
  CJK: /[一-鿿぀-ヿ]/,
  Hangul: /[가-힯]/,
  Arabic: /[؀-ۿ]/,
  Greek: /[Ͱ-Ͽ]/,
};

const problems = [];
source.split('\n').forEach((line, index) => {
  const match = line.match(/:\s*'((?:[^'\\]|\\.)*)'/);
  if (!match) return;
  const value = match[1];
  const hits = Object.entries(SCRIPTS)
    .filter(([, pattern]) => pattern.test(value))
    .map(([name]) => name);
  if (hits.length > 1) {
    problems.push(`  line ${index + 1}  ${hits.join(' + ')}  ${JSON.stringify(value.slice(0, 70))}`);
  }
});

if (problems.length > 0) {
  console.error('\n✗ These strings mix writing systems:\n');
  problems.forEach((p) => console.error(p));
  console.error(
    '\nEach is unreadable to the speaker it was written for. Rewrite the whole\n' +
    'string in one language rather than patching the spliced fragment.\n',
  );
  process.exit(1);
}

console.log('check-locale-scripts: no string mixes writing systems.');
