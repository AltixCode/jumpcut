import { EMPTY_PACING, parsePacing, serialisePacing } from '../adPacing';

describe('parsePacing', () => {
  it('reads back what serialisePacing wrote', () => {
    const state = { completions: 7, lastInterstitialAt: 1_700_000_000_000 };
    expect(parsePacing(serialisePacing(state), 1_800_000_000_000)).toEqual(state);
  });

  it.each([
    ['missing file', null],
    ['empty string', ''],
    ['truncated write', '{"completions":'],
    ['an array', '[1,2]'],
    ['a bare number', '42'],
    ['null literal', 'null'],
  ])('treats %s as a fresh install', (_label, raw) => {
    expect(parsePacing(raw)).toEqual(EMPTY_PACING);
  });

  it('rejects values that would skip the first-export grace period', () => {
    expect(parsePacing('{"completions":-5}').completions).toBe(0);
    expect(parsePacing('{"completions":"12"}').completions).toBe(0);
    expect(parsePacing('{"completions":null}').completions).toBe(0);
    expect(parsePacing('{"completions":1e999}').completions).toBe(0);
    expect(parsePacing('{"completions":2.9}').completions).toBe(2);
  });

  it('clamps a timestamp from the future to now', () => {
    // Set the clock forward, show an ad, set it back: without the clamp the stored timestamp
    // is years ahead and the minimum-gap check suppresses every interstitial until then.
    const now = 1_000_000;
    expect(parsePacing('{"lastInterstitialAt":999999999999}', now).lastInterstitialAt).toBe(now);
    expect(parsePacing('{"lastInterstitialAt":900000}', now).lastInterstitialAt).toBe(900_000);
  });

  it('never writes a negative counter', () => {
    expect(serialisePacing({ completions: -1, lastInterstitialAt: -1 })).toBe(
      '{"completions":0,"lastInterstitialAt":0}',
    );
  });
});
