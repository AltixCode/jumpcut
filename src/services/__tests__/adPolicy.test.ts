import {
  COMPLETIONS_BETWEEN_INTERSTITIALS,
  MIN_MS_BETWEEN_INTERSTITIALS,
  shouldShowInterstitial,
} from '../adPolicy';

const base = {
  completions: 4,
  lastInterstitialAt: 0,
  now: MIN_MS_BETWEEN_INTERSTITIALS * 10,
  isPro: false,
};

describe('shouldShowInterstitial', () => {
  it('never interrupts someone who paid to remove ads', () => {
    expect(shouldShowInterstitial({ ...base, isPro: true })).toBe(false);
  });

  it('leaves the first completion alone', () => {
    // The first piece of work is where someone decides whether to keep the app.
    expect(shouldShowInterstitial({ ...base, completions: 1 })).toBe(false);
  });

  it('shows on the cadence once past the first', () => {
    expect(shouldShowInterstitial({ ...base, completions: 2 })).toBe(true);
    expect(shouldShowInterstitial({ ...base, completions: 3 })).toBe(false);
    expect(shouldShowInterstitial({ ...base, completions: 4 })).toBe(true);
  });

  it('honours the minimum gap even when the count says yes', () => {
    const now = 1_000_000;
    expect(
      shouldShowInterstitial({
        ...base,
        now,
        lastInterstitialAt: now - MIN_MS_BETWEEN_INTERSTITIALS + 1,
      }),
    ).toBe(false);
    expect(
      shouldShowInterstitial({
        ...base,
        now,
        lastInterstitialAt: now - MIN_MS_BETWEEN_INTERSTITIALS,
      }),
    ).toBe(true);
  });

  it('stays quiet when the clock moves backwards', () => {
    // A device whose clock jumps back makes `now - last` negative, which must not be read as
    // "plenty of time has passed".
    expect(shouldShowInterstitial({ ...base, now: 0, lastInterstitialAt: 5_000_000 })).toBe(false);
  });

  it('refuses a nonsense count rather than guessing', () => {
    expect(shouldShowInterstitial({ ...base, completions: Number.NaN })).toBe(false);
  });

  it('keeps the cadence constant as the count grows', () => {
    const shown = [2, 3, 4, 5, 6, 7, 8].filter((completions) =>
      shouldShowInterstitial({ ...base, completions }),
    );
    expect(shown).toEqual([2, 4, 6, 8]);
    expect(COMPLETIONS_BETWEEN_INTERSTITIALS).toBe(2);
  });
});
