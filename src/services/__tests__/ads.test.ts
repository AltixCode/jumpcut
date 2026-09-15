import type { MockAd } from '../../../test/google-mobile-ads';

/**
 * The service is re-required after every module reset, so the SDK handle must come from the
 * same fresh registry -- a reference captured at import time would be a different instance
 * than the one the service under test is holding.
 */
const sdkModule = () =>
  require('react-native-google-mobile-ads') as {
    __lastAd: () => MockAd;
    __resetAds: () => void;
    default: () => { initialize: jest.Mock; setRequestConfiguration: jest.Mock };
    AdsConsent: { gatherConsent: jest.Mock; showPrivacyOptionsForm: jest.Mock };
  };

const CONSENTED = {
  status: 'OBTAINED',
  canRequestAds: true,
  privacyOptionsRequirementStatus: 'NOT_REQUIRED',
};
const WITHHELD = {
  status: 'REQUIRED',
  canRequestAds: false,
  privacyOptionsRequirementStatus: 'REQUIRED',
};

describe('ads service', () => {
  let ads: typeof import('../ads');
  let sdk: ReturnType<typeof sdkModule>;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useRealTimers();
    sdk = sdkModule();
    sdk.__resetAds();
    ads = require('../ads');
  });

  describe('initializeAds', () => {
    it('gathers consent before touching the ads SDK', async () => {
      sdk.AdsConsent.gatherConsent.mockResolvedValueOnce(CONSENTED);
      await ads.initializeAds();

      expect(sdk.AdsConsent.gatherConsent).toHaveBeenCalled();
      expect(sdk.default().initialize).toHaveBeenCalled();
      expect(ads.getConsentSummary().canServeAds).toBe(true);
    });

    it('never initialises the ads SDK when consent is withheld', async () => {
      sdk.AdsConsent.gatherConsent.mockResolvedValueOnce(WITHHELD);
      await ads.initializeAds();

      expect(sdk.default().initialize).not.toHaveBeenCalled();
      expect(ads.getConsentSummary().canServeAds).toBe(false);
    });

    it('fails closed when the consent flow throws', async () => {
      sdk.AdsConsent.gatherConsent.mockRejectedValueOnce(new Error('no network'));
      await ads.initializeAds();

      expect(sdk.default().initialize).not.toHaveBeenCalled();
      expect(ads.getConsentSummary().canServeAds).toBe(false);
    });

    it('runs the consent flow once however many callers there are', async () => {
      sdk.AdsConsent.gatherConsent.mockResolvedValue(CONSENTED);
      await Promise.all([ads.initializeAds(), ads.initializeAds()]);
      await ads.initializeAds();

      expect(sdk.AdsConsent.gatherConsent).toHaveBeenCalledTimes(1);
    });

    it('publishes consent to the store the banner reads', async () => {
      sdk.AdsConsent.gatherConsent.mockResolvedValueOnce(CONSENTED);
      await ads.initializeAds();

      const { useAdsStore } = require('../../store/adsStore');
      expect(useAdsStore.getState().consent.canServeAds).toBe(true);
    });
  });

  describe('showInterstitial', () => {
    beforeEach(async () => {
      sdk.AdsConsent.gatherConsent.mockResolvedValueOnce(CONSENTED);
      await ads.initializeAds();
    });

    it('resolves true only after the ad has been shown and dismissed', async () => {
      const ad = sdk.__lastAd();
      ad.loaded = true;

      const pending = ads.showInterstitial();
      await Promise.resolve();
      expect(ad.show).toHaveBeenCalled();

      ad.__emit('closed');
      await expect(pending).resolves.toBe(true);
    });

    it('resolves false when the ad errors, and does not leave the caller waiting', async () => {
      const ad = sdk.__lastAd();
      ad.loaded = true;

      const pending = ads.showInterstitial();
      await Promise.resolve();
      ad.__emit('error', new Error('no fill'));

      await expect(pending).resolves.toBe(false);
    });

    it('shows the ad once it finishes loading mid-request', async () => {
      const ad = sdk.__lastAd();
      ad.loaded = false;

      const pending = ads.showInterstitial();
      await Promise.resolve();
      expect(ad.show).not.toHaveBeenCalled();

      ad.__emit('loaded');
      await Promise.resolve();
      expect(ad.show).toHaveBeenCalled();

      ad.__emit('closed');
      await expect(pending).resolves.toBe(true);
    });

    it('gives up rather than hanging when the ad never answers', async () => {
      jest.useFakeTimers();
      const ad = sdk.__lastAd();
      ad.loaded = true;

      const pending = ads.showInterstitial();
      await Promise.resolve();
      jest.advanceTimersByTime(8000);

      await expect(pending).resolves.toBe(false);
    });

    it('detaches its listeners once settled, so a later event cannot resolve it twice', async () => {
      const ad = sdk.__lastAd();
      ad.loaded = true;

      const pending = ads.showInterstitial();
      await Promise.resolve();
      ad.__emit('closed');
      await pending;

      expect(ad.__has('closed')).toBe(false);
      expect(ad.__has('error')).toBe(false);
    });

    it('reloads for next time after one is consumed', async () => {
      const first = sdk.__lastAd();
      first.loaded = true;

      const pending = ads.showInterstitial();
      await Promise.resolve();
      first.__emit('closed');
      await pending;

      const next = sdk.__lastAd();
      expect(next).not.toBe(first);
      expect(next.load).toHaveBeenCalled();
    });
  });

  it('reports false rather than throwing when no ad was ever preloaded', async () => {
    // Consent withheld means initializeAds returns before preloading anything.
    sdk.AdsConsent.gatherConsent.mockResolvedValueOnce(WITHHELD);
    await ads.initializeAds();

    await expect(ads.showInterstitial()).resolves.toBe(false);
  });

  describe('showPrivacyOptionsForm', () => {
    it('republishes consent after the user changes it', async () => {
      const ok = await ads.showPrivacyOptionsForm();
      expect(ok).toBe(true);
      expect(ads.getConsentSummary().offerPrivacyOptions).toBe(true);
    });

    it('resolves false rather than throwing when the form cannot open', async () => {
      sdk.AdsConsent.showPrivacyOptionsForm.mockRejectedValueOnce(new Error('unavailable'));
      await expect(ads.showPrivacyOptionsForm()).resolves.toBe(false);
    });
  });
});
