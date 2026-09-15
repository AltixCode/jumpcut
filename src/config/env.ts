import { Platform } from 'react-native';
import { missingReleaseConfigFrom, RELEASE_ENV_KEYS, selectPlatformValue } from './releaseConfig';

/**
 * Third-party identifiers, all from EXPO_PUBLIC_* env vars wired through the EAS build profile
 * and GitHub Actions secrets. Nothing secret is committed: RevenueCat public SDK keys and AdMob
 * unit ids are client-side identifiers, and the private API keys they pair with never reach the
 * bundle.
 *
 * With nothing configured the app falls back to Google's official *test* ad units, so a local
 * build can never serve or click a live ad. That fallback is also the most expensive failure
 * mode there is -- a store build missing one variable earns nothing while looking perfectly
 * healthy -- which is what `npm run check:release` exists to catch.
 */

function pick(ios?: string, android?: string): string | undefined {
  return selectPlatformValue(ios, android, Platform.OS);
}

export const IS_DEV = __DEV__;

export const ADMOB = {
  interstitialUnitId: pick(
    process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL,
    process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL,
  ),
  bannerUnitId: pick(
    process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
    process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
  ),
};

/**
 * The RevenueCat public SDK key.
 *
 * Two spellings are accepted because the app shipped with `EXPO_PUBLIC_RC_*` before the
 * portfolio settled on `EXPO_PUBLIC_REVENUECAT_*`, and an EAS environment still carrying the
 * old name must not silently disable purchases. The canonical name wins where both are set,
 * and it is the only one `check:release` will accept.
 */
export const REVENUECAT_API_KEY = pick(
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? process.env.EXPO_PUBLIC_RC_IOS_KEY,
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
);

export { missingReleaseConfigFrom, RELEASE_ENV_KEYS, selectPlatformValue };
