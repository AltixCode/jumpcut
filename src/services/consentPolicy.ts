/**
 * Decisions derived from Google's User Messaging Platform (UMP) consent state.
 *
 * Kept as pure functions so the compliance rules are unit tested rather than buried in an
 * async service: serving personalised ads to an EEA/UK user who never saw a consent form
 * breaches Google's policy and is a common cause of AdMob account suspension.
 */

export type ConsentStatus = 'UNKNOWN' | 'REQUIRED' | 'NOT_REQUIRED' | 'OBTAINED';

export interface ConsentInfoLike {
  status: ConsentStatus;
  canRequestAds: boolean;
  privacyOptionsRequirementStatus: ConsentStatus;
}

export interface ConsentSummary {
  canServeAds: boolean;
  offerPrivacyOptions: boolean;
}

/**
 * The UMP SDK owns this decision — it accounts for region, consent status and the TCF string.
 * Anything other than an explicit `true` fails closed and the app simply runs without ads.
 */
export function canServeAds(info: ConsentInfoLike | null | undefined): boolean {
  return info?.canRequestAds === true;
}

/** Google requires an in-app entry point to reopen the form wherever it reports REQUIRED. */
export function shouldOfferPrivacyOptions(info: ConsentInfoLike | null | undefined): boolean {
  return info?.privacyOptionsRequirementStatus === 'REQUIRED';
}

export function summariseConsent(info: ConsentInfoLike | null | undefined): ConsentSummary {
  return {
    canServeAds: canServeAds(info),
    offerPrivacyOptions: shouldOfferPrivacyOptions(info),
  };
}
