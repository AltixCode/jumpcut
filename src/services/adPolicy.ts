/**
 * Interstitial pacing.
 *
 * Deliberately more conservative than a game would be. People open a tool to finish a job; an
 * ad in the middle of that reads as the app getting in the way, and the first piece of work is
 * where someone decides whether the app is worth keeping. So the first one is always clean, and
 * the ad comes *after* the work is finished and saved -- never before it, and never while it
 * runs.
 *
 * A "completion" is whatever the app exists to produce, counted once it has actually succeeded:
 * a captioned video written to the library, a redacted PDF saved, a signed document exported.
 * Counting attempts instead would show an ad to someone whose export just failed.
 *
 * This file is identical across the portfolio. Change it here and port it, rather than tuning
 * one app's copy -- pacing that differs per app is pacing nobody can reason about.
 */

export const COMPLETIONS_BETWEEN_INTERSTITIALS = 2;
export const MIN_COMPLETIONS_BEFORE_FIRST_INTERSTITIAL = 1;
export const MIN_MS_BETWEEN_INTERSTITIALS = 90_000;

export interface InterstitialContext {
  /** Successful completions, including the one that just finished. */
  completions: number;
  lastInterstitialAt: number;
  now: number;
  /** True once the upgrade is owned: no ads at all, ever. */
  isPro: boolean;
}

export function shouldShowInterstitial({
  completions,
  lastInterstitialAt,
  now,
  isPro,
}: InterstitialContext): boolean {
  if (isPro) return false;
  if (!Number.isFinite(completions) || completions <= MIN_COMPLETIONS_BEFORE_FIRST_INTERSTITIAL) {
    return false;
  }
  if (completions % COMPLETIONS_BETWEEN_INTERSTITIALS !== 0) return false;

  const elapsed = now - lastInterstitialAt;
  // A negative elapsed time means the device clock moved backwards -- stay quiet rather than
  // showing an ad the cadence did not earn.
  if (elapsed < MIN_MS_BETWEEN_INTERSTITIALS) return false;

  return true;
}
