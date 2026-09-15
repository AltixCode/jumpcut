import { Platform } from 'react-native';
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentDebugGeography,
  InterstitialAd,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { ADMOB, IS_DEV } from '../config/env';
import { summariseConsent, type ConsentInfoLike, type ConsentSummary } from './consentPolicy';
import { useAdsStore } from '../store/adsStore';

/**
 * Thin AdMob wrapper: a banner and an interstitial, no rewarded ad. Every entry point resolves
 * rather than throws -- an ad failure must never block the work the app exists to do, so a
 * missing fill just means the user carries on without an ad.
 */

const interstitialUnitId =
  IS_DEV || !ADMOB.interstitialUnitId ? TestIds.INTERSTITIAL : ADMOB.interstitialUnitId;
export const bannerUnitId =
  IS_DEV || !ADMOB.bannerUnitId ? TestIds.ADAPTIVE_BANNER : ADMOB.bannerUnitId;

const AD_TIMEOUT_MS = 8000;

let initialized = false;
let interstitial: InterstitialAd | null = null;
let consent: ConsentSummary = { canServeAds: false, offerPrivacyOptions: false };

function applyConsent(next: ConsentSummary): void {
  consent = next;
  useAdsStore.getState().setConsent(next);
  // Whether ads may be served is invisible from the outside -- a withheld consent and a broken
  // integration look identical, an app with no banner -- so the decision is logged in
  // development. Release builds say nothing.
  if (IS_DEV) console.log('[ads] consent', JSON.stringify(next));
}

export function getConsentSummary(): ConsentSummary {
  return consent;
}

/**
 * Runs Google's User Messaging Platform flow: fetches the consent state and, where the user's
 * region requires it, presents the consent form. Must complete before the Mobile Ads SDK is
 * initialised, or the first ad request can go out without consent.
 */
async function gatherConsent(): Promise<ConsentSummary> {
  try {
    /**
     * In development the geography is forced so both paths can be exercised on a simulator:
     * `EEA` makes the consent form appear every launch, `OTHER` skips it. Release builds pass
     * no options at all and let the SDK decide from the real location.
     */
    const options = IS_DEV
      ? { debugGeography: AdsConsentDebugGeography.OTHER, testDeviceIdentifiers: [] }
      : undefined;

    const info = (await AdsConsent.gatherConsent(options)) as unknown as ConsentInfoLike;
    return summariseConsent(info);
  } catch {
    // Fail closed: no consent information means no ads, and the app works regardless.
    return { canServeAds: false, offerPrivacyOptions: false };
  }
}

/** Reopens the consent form. Google requires this entry point wherever it reports REQUIRED. */
export async function showPrivacyOptionsForm(): Promise<boolean> {
  try {
    const info = (await AdsConsent.showPrivacyOptionsForm()) as unknown as ConsentInfoLike;
    applyConsent(summariseConsent(info));
    return true;
  } catch {
    return false;
  }
}

/**
 * iOS requires the ATT prompt before AdMob can request personalised ads. It must run after the
 * app is interactive, and a denial is a normal outcome — we simply fall back to non-personalised.
 */
export async function requestTrackingIfNeeded(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  try {
    const { status } = await requestTrackingPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function initializeAds(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    // Order matters: UMP consent first, then ATT, then the SDK. Initialising the Mobile Ads
    // SDK before consent is gathered can put an ad request on the wire without it.
    applyConsent(await gatherConsent());
    await requestTrackingIfNeeded();

    if (!consent.canServeAds) return;

    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.G,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
    preloadInterstitial();
  } catch (error) {
    // Ads are optional; the app works regardless.
    if (IS_DEV) console.log('[ads] initialisation failed', String(error));
  }
}

function createInterstitial(): InterstitialAd {
  return InterstitialAd.createForAdRequest(interstitialUnitId, {
    requestNonPersonalizedAdsOnly: false,
  });
}

export function preloadInterstitial(): void {
  try {
    interstitial = createInterstitial();
    interstitial.load();
  } catch {
    interstitial = null;
  }
}

function withTimeout<T>(
  executor: (resolve: (value: T) => void) => () => void,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };
    const cleanup = executor(finish);
    const timer = setTimeout(() => finish(fallback), AD_TIMEOUT_MS);
  });
}

/** Resolves true when an interstitial was actually shown and dismissed. */
export async function showInterstitial(): Promise<boolean> {
  const ad = interstitial;
  if (!ad) {
    preloadInterstitial();
    return false;
  }

  const shown = await withTimeout<boolean>((finish) => {
    const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => finish(true));
    const unsubscribeError = ad.addAdEventListener(AdEventType.ERROR, () => finish(false));
    const unsubscribeLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      ad.show().catch(() => finish(false));
    });
    if (ad.loaded) ad.show().catch(() => finish(false));
    return () => {
      unsubscribeClosed();
      unsubscribeError();
      unsubscribeLoaded();
    };
  }, false);

  preloadInterstitial();
  return shown;
}

/** Test seam so suites can start from a clean module state. */
export function resetAdsForTests(): void {
  initialized = false;
  interstitial = null;
  applyConsent({ canServeAds: false, offerPrivacyOptions: false });
}
