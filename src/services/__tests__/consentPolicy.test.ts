import {
  canServeAds,
  shouldOfferPrivacyOptions,
  summariseConsent,
  type ConsentInfoLike,
} from '../consentPolicy';

const info = (overrides: Partial<ConsentInfoLike> = {}): ConsentInfoLike => ({
  status: 'OBTAINED',
  canRequestAds: true,
  privacyOptionsRequirementStatus: 'NOT_REQUIRED',
  ...overrides,
});

describe('canServeAds', () => {
  it('serves once the UMP SDK says the app may request ads', () => {
    expect(canServeAds(info({ canRequestAds: true }))).toBe(true);
  });

  it('does not serve while consent is still outstanding', () => {
    expect(canServeAds(info({ canRequestAds: false, status: 'REQUIRED' }))).toBe(false);
  });

  it('serves outside regulated regions where no consent is required', () => {
    expect(canServeAds(info({ status: 'NOT_REQUIRED', canRequestAds: true }))).toBe(true);
  });

  // If the consent SDK is unreachable we must fail closed: showing ads to an EEA user who never
  // saw a form is the failure mode that gets an AdMob account suspended.
  it('fails closed when the consent state is unknown', () => {
    expect(canServeAds(null)).toBe(false);
    expect(canServeAds(undefined)).toBe(false);
  });

  it('fails closed on a malformed response', () => {
    expect(canServeAds({} as ConsentInfoLike)).toBe(false);
    expect(canServeAds({ canRequestAds: 'yes' } as unknown as ConsentInfoLike)).toBe(false);
  });
});

describe('shouldOfferPrivacyOptions', () => {
  // Google requires an in-app entry point to re-open the form wherever it says REQUIRED.
  it('offers the privacy options entry point when the SDK requires one', () => {
    expect(shouldOfferPrivacyOptions(info({ privacyOptionsRequirementStatus: 'REQUIRED' }))).toBe(
      true,
    );
  });

  it('hides it when it is not required', () => {
    expect(
      shouldOfferPrivacyOptions(info({ privacyOptionsRequirementStatus: 'NOT_REQUIRED' })),
    ).toBe(false);
    expect(shouldOfferPrivacyOptions(info({ privacyOptionsRequirementStatus: 'UNKNOWN' }))).toBe(
      false,
    );
  });

  it('hides it when there is no consent information at all', () => {
    expect(shouldOfferPrivacyOptions(null)).toBe(false);
  });
});

describe('summariseConsent', () => {
  it('reduces a consent response to the two decisions the app actually makes', () => {
    expect(summariseConsent(info({ privacyOptionsRequirementStatus: 'REQUIRED' }))).toEqual({
      canServeAds: true,
      offerPrivacyOptions: true,
    });
  });

  it('returns a safe summary for a missing response', () => {
    expect(summariseConsent(null)).toEqual({ canServeAds: false, offerPrivacyOptions: false });
  });
});
