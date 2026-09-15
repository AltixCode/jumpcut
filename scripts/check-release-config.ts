/**
 * Refuses a store build that would ship without its real AdMob and RevenueCat identifiers.
 *
 * A missing identifier does not crash anything: the app falls back to Google's test ad units,
 * works perfectly, and earns nothing. That is invisible in QA and only shows up as a flat
 * revenue line weeks later, after the UA spend has already gone out. Hence a hard stop.
 *
 * Run: npm run check:release
 */
import { missingReleaseConfigFrom, RELEASE_ENV_KEYS } from '../src/config/releaseConfig';

const missing = missingReleaseConfigFrom(process.env);

if (missing.length === 0) {
  console.log(`✓ All ${RELEASE_ENV_KEYS.length} release identifiers are set.`);
  process.exit(0);
}

console.error('\n✗ This build is not ready for the stores.\n');
console.error('Missing, blank, or still a Google test unit:\n');
missing.forEach((key) => console.error(`    ${key}`));
console.error(
  [
    '',
    'Without these the app silently serves Google test ads and earns nothing.',
    'Set them as EAS environment variables for the production environment:',
    '',
    '    eas env:create --environment production --name <KEY> --value <value>',
    '',

    '',
  ].join('\n'),
);
process.exit(1);
