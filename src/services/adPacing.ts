/**
 * Parsing and serialising the interstitial pacing counters.
 *
 * Kept pure and separate from the file IO so the awkward cases -- a truncated write, a hand
 * edited file, a clock that moved -- can be tested without a filesystem. Everything here fails
 * towards *fewer* ads: unreadable state is treated as a fresh install, which costs at most one
 * skipped impression, whereas trusting a bad value could show an ad on someone's first export.
 */

export interface PacingState {
  /** Successful completions over the app's lifetime on this device. */
  completions: number;
  /** Epoch ms of the last interstitial shown, or 0 if none. */
  lastInterstitialAt: number;
}

export const EMPTY_PACING: PacingState = { completions: 0, lastInterstitialAt: 0 };

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function parsePacing(raw: string | null | undefined, now: number = Date.now()): PacingState {
  if (!raw) return EMPTY_PACING;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PACING;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_PACING;

  const record = parsed as Record<string, unknown>;
  const lastInterstitialAt = nonNegativeInteger(record.lastInterstitialAt);

  return {
    completions: nonNegativeInteger(record.completions),
    // A timestamp in the future means the device clock was moved back after the ad was shown.
    // Clamping to now keeps the minimum gap honest instead of suppressing ads until the
    // original date arrives, which on a clock set years ahead would be permanent.
    lastInterstitialAt: lastInterstitialAt > now ? now : lastInterstitialAt,
  };
}

export function serialisePacing(state: PacingState): string {
  return JSON.stringify({
    completions: nonNegativeInteger(state.completions),
    lastInterstitialAt: nonNegativeInteger(state.lastInterstitialAt),
  });
}
