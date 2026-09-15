/// <reference types="jest" />
/**
 * Stands in for react-native-google-mobile-ads under Jest.
 *
 * Ads created here record their listeners, so a test can drive the real event sequence
 * (loaded -> shown -> closed) rather than stubbing the outcome. That is the difference between
 * proving the service resolves correctly and proving only that it was called.
 */
export const AdEventType = {
  LOADED: 'loaded',
  ERROR: 'error',
  CLOSED: 'closed',
  OPENED: 'opened',
} as const;

export const MaxAdContentRating = { G: 'G', PG: 'PG', T: 'T', MA: 'MA' } as const;
export const BannerAdSize = { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' } as const;
export const AdsConsentDebugGeography = {
  DISABLED: 0,
  EEA: 1,
  REGULATED_US_STATE: 3,
  OTHER: 4,
} as const;
export const TestIds = {
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  ADAPTIVE_BANNER: 'ca-app-pub-3940256099942544/9214589741',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
} as const;

export interface MockAd {
  loaded: boolean;
  load: jest.Mock;
  show: jest.Mock;
  addAdEventListener: jest.Mock;
  __emit: (type: string, payload?: unknown) => void;
  __has: (type: string) => boolean;
}

const createdAds: MockAd[] = [];

function makeAd(): MockAd {
  const listeners = new Map<string, (payload?: unknown) => void>();
  const ad: MockAd = {
    loaded: false,
    load: jest.fn(),
    show: jest.fn(() => Promise.resolve()),
    addAdEventListener: jest.fn((type: string, handler: (payload?: unknown) => void) => {
      listeners.set(type, handler);
      return jest.fn(() => listeners.delete(type));
    }),
    __emit: (type, payload) => listeners.get(type)?.(payload),
    __has: (type) => listeners.has(type),
  };
  createdAds.push(ad);
  return ad;
}

export const __lastAd = (): MockAd => createdAds[createdAds.length - 1];
export const __resetAds = (): void => {
  createdAds.length = 0;
};

const CONSENT_GRANTED = {
  status: 'NOT_REQUIRED',
  canRequestAds: true,
  privacyOptionsRequirementStatus: 'NOT_REQUIRED',
};

export const AdsConsent = {
  gatherConsent: jest.fn(() => Promise.resolve(CONSENT_GRANTED)),
  showPrivacyOptionsForm: jest.fn(() =>
    Promise.resolve({
      status: 'OBTAINED',
      canRequestAds: true,
      privacyOptionsRequirementStatus: 'REQUIRED',
    }),
  ),
};

export const InterstitialAd = { createForAdRequest: jest.fn(makeAd) };

const mobileAdsInstance = {
  initialize: jest.fn(() => Promise.resolve([])),
  setRequestConfiguration: jest.fn(() => Promise.resolve()),
};

export const BannerAd = () => null;

const mobileAds = () => mobileAdsInstance;
export default mobileAds;
