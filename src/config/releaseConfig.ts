/**
 * Release identifier policy. Deliberately free of any React Native import so the build-time
 * check (`npm run check:release`) can run it under plain Node.
 */

/** Google's own test ad unit prefix. Shipping one of these earns nothing, silently. */
export const TEST_AD_UNIT_PREFIX = 'ca-app-pub-3940256099942544';

export function present(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Chooses the identifier for the running platform. Never falls back to the other platform's
 * value — that would ship the iOS ad unit inside the Android build — and treats an empty
 * string as absent, since an unset variable in CI usually arrives as "" rather than undefined.
 */
export function selectPlatformValue(
  ios: string | undefined,
  android: string | undefined,
  platform: string,
): string | undefined {
  const value = platform === 'ios' ? ios : platform === 'android' ? android : undefined;
  return present(value) ? value : undefined;
}

/**
 * Every identifier a store build must carry. A production build that is missing one does not
 * crash — it quietly falls back to Google's test ad units and earns nothing, which is the most
 * expensive failure mode this project has. The release check turns that into a hard stop.
 */
/* JumpCut serves a banner and an interstitial only -- there is no rewarded placement, so the
   rewarded unit ids other apps in the portfolio require are deliberately absent here. */
export const RELEASE_ENV_KEYS = [
  'EXPO_PUBLIC_ADMOB_IOS_APP_ID',
  'EXPO_PUBLIC_ADMOB_ANDROID_APP_ID',
  'EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL',
  'EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL',
  'EXPO_PUBLIC_ADMOB_IOS_BANNER',
  'EXPO_PUBLIC_ADMOB_ANDROID_BANNER',
  'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
] as const;

/** Names the release identifiers that are absent, blank, or still a Google test unit. */
export function missingReleaseConfigFrom(env: Record<string, string | undefined>): string[] {
  return RELEASE_ENV_KEYS.filter((key) => {
    const value = env[key];
    if (!present(value)) return true;
    return value.startsWith(TEST_AD_UNIT_PREFIX);
  });
}
