import { useAdsStore } from '../adsStore';
import { readPacing } from '../../services/adPacingFile';
import { __reset } from '../../../test/expo-file-system-legacy';

describe('adsStore pacing', () => {
  beforeEach(() => {
    __reset();
    useAdsStore.getState().resetForTests();
  });

  it('starts a fresh install at zero', async () => {
    await useAdsStore.getState().hydrate();
    expect(useAdsStore.getState().completions).toBe(0);
    expect(useAdsStore.getState().lastInterstitialAt).toBe(0);
  });

  it('survives a relaunch', async () => {
    await useAdsStore.getState().recordCompletion();
    await useAdsStore.getState().recordCompletion();

    // A relaunch is an empty store reading the file back.
    useAdsStore.getState().resetForTests();
    expect(useAdsStore.getState().completions).toBe(0);
    await useAdsStore.getState().hydrate();

    expect(useAdsStore.getState().completions).toBe(2);
  });

  it('keeps the export count when an interstitial is recorded', async () => {
    await useAdsStore.getState().recordCompletion();
    await useAdsStore.getState().markInterstitialShown();

    const persisted = await readPacing();
    expect(persisted.completions).toBe(1);
    expect(persisted.lastInterstitialAt).toBeGreaterThan(0);
  });

  it('counts finished work whether or not an ad followed it', async () => {
    // The cadence must advance on exports, not on impressions: pacing off impressions would
    // stall permanently the first time no ad was available to fill.
    await useAdsStore.getState().recordCompletion();
    await useAdsStore.getState().recordCompletion();
    expect((await readPacing()).completions).toBe(2);
    expect((await readPacing()).lastInterstitialAt).toBe(0);
  });
});
