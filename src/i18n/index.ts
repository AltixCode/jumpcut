import * as Localization from 'expo-localization';

export type SupportedLanguage =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'ru'
  | 'zh'
  | 'ja'
  | 'pt'
  | 'ko'
  | 'it'
  | 'tr'
  | 'ar'
  | 'fa'
  | 'el';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  'en',
  'es',
  'fr',
  'de',
  'ru',
  'zh',
  'ja',
  'pt',
  'ko',
  'it',
  'tr',
  'ar',
  'fa',
  'el',
];

export const translations = {
  "en": {
    "appName": "JumpCut",
    "proBadge": "PRO",
    "back": "Back",
    "cancel": "Cancel",
    "error": "Error",
    "heroBadge": "SILENCE REMOVED",
    "heroTitle": "Cut the dead air.",
    "heroSubtitle": "JumpCut finds every pause and takes it out, keeping a breath either side so the cuts do not sound clipped.",
    "chooseVideo": "Choose a Video",
    "replaceVideo": "Choose a Different Video",
    "noVideoTitle": "No Video Selected",
    "noVideoDesc": "Pick a clip and JumpCut will find its silences.",
    "libraryDenied": "Photo Access Needed",
    "libraryDeniedDesc": "JumpCut needs access to your library to read the video you want to cut. You can grant it in Settings.",
    "videoUnreadable": "This Video Cannot Be Read",
    "videoUnreadableDesc": "The file could not be opened. Try a different clip.",
    "noAudioTitle": "No Audio Found",
    "noAudioDesc": "This clip has no audio track, so there are no silences to find.",
    "videoReady": "{width}x{height} - {duration}",
    "secondsShort": "{seconds}s",
    "minutesShort": "{minutes}m {seconds}s",
    "analyse": "Find the Silences",
    "analysing": "Listening...",
    "analyseFailed": "Analysis Failed",
    "noSilenceTitle": "Nothing to Cut",
    "noSilenceDesc": "JumpCut found no pauses long enough to remove. Try lowering the threshold.",
    "resultTitle": "What JumpCut Found",
    "silenceCount": "{count} silences",
    "silenceCount_one": "{count} silence",
    "timeSaved": "Time removed",
    "newLength": "New length",
    "sensitivity": "Sensitivity",
    "sensitivityLow": "Only long pauses",
    "sensitivityHigh": "Every gap",
    "cut": "Cut and Save",
    "cutting": "Cutting - {percent}%",
    "cutFailed": "Export Failed",
    "saved": "Saved!",
    "savedDesc": "The cut video is in your photo library, {duration} long.",
    "saveDenied": "Photo Access Needed",
    "saveDeniedDesc": "JumpCut needs permission to add the cut video to your library.",
    "freeLimitNotice": "Free exports cover the first {seconds} seconds. Unlock JumpCut Pro to cut the whole clip.",
    "archGuarantees": "WHAT YOU GET",
    "paddingTitle": "Cuts that do not clip",
    "paddingDesc": "A breath is kept either side of every phrase, so the first word keeps its attack and the last keeps its release.",
    "preciseTitle": "Cuts where you mean",
    "preciseDesc": "Frames are re-encoded, so a cut lands between two words instead of snapping to the nearest keyframe.",
    "onDeviceTitle": "100% private on-device",
    "onDeviceDesc": "Your video never leaves the phone. No server, no account, no tracking.",
    "paywallTitle": "JumpCut Pro",
    "lifetimeAccess": "Unlock Lifetime Access - {price}",
    "lifetimeAccessPlain": "Unlock Lifetime Access",
    "restorePurchases": "Restore Purchases",
    "oneTimePayment": "One-time payment. Never recurring.",
    "termsOfUse": "Terms of Use",
    "privacyPolicy": "Privacy Policy",
    "antiSubTitle": "ANTI-SUBSCRIPTION PROMISE",
    "antiSubHeadline": "No Subscriptions. No Accounts. 100% On-Device Privacy. Own It Forever.",
    "antiSubDesc": "Silence-cutting editors charge $12-$30 every month and upload your footage to do it. JumpCut is one purchase you keep forever, and it never uploads anything.",
    "storeUnavailable": "Store Unavailable",
    "noPriorPurchases": "No previous purchase was found for this account.",
    "cancelled": "Purchase Cancelled",
    "unlocked": "JumpCut Pro Unlocked",
    "purchaseFailed": "Purchase Failed",
    "purchaseFailedDesc": "The purchase could not be completed. Please try again.",
    "restoreFailed": "Nothing to Restore",
    "restoreFailedDesc": "No previous purchase was found for this account.",
    "feat1Title": "Clips of any length",
    "feat1Desc": "The free tier covers the first minute; Pro cuts the whole recording.",
    "feat2Title": "Tune the sensitivity",
    "feat2Desc": "Decide how long a pause has to be before it counts as dead air.",
    "feat3Title": "Full-quality export",
    "feat3Desc": "Cut at the clip's own resolution, ready to post.",
    "feat4Title": "100% private on-device",
    "feat4Desc": "Your video never leaves the phone. No server, no account, no tracking."
  }
} as const;

export type TranslationKey = keyof typeof translations['en'];

export function getDeviceLanguage(): SupportedLanguage {
  try {
    const locales = Localization.getLocales();
    const code = locales?.[0]?.languageCode?.toLowerCase();
    if (code && (SUPPORTED_LANGUAGES as string[]).includes(code)) {
      return code as SupportedLanguage;
    }
  } catch {
    // fallback
  }
  return 'en';
}

let currentLanguage: SupportedLanguage = getDeviceLanguage();

export function setLanguage(lang: SupportedLanguage) {
  currentLanguage = lang;
}

export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

export function isRTL(): boolean {
  return currentLanguage === 'ar' || currentLanguage === 'fa';
}

/**
 * CLDR plural category for `count` in the active language, e.g. "one" or
 * "other" in English, which also has "few"/"many" in Russian and Arabic.
 *
 * Falls back to an English-style one/other split where Intl.PluralRules is
 * unavailable, which is still better than always rendering the plural form.
 */
function pluralCategory(count: number): string {
  try {
    return new Intl.PluralRules(currentLanguage).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const langDict = (translations as any)[currentLanguage] || translations.en;
  // A key may carry plural variants as suffixed siblings ("exportClips_one").
  // Only keys that actually define one are affected; everything else resolves
  // to the base key exactly as before.
  let resolved: string = key as string;
  if (params && typeof params.count === 'number') {
    const variant = `${key}_${pluralCategory(params.count)}`;
    if (langDict[variant] || (translations.en as any)[variant]) resolved = variant;
  }
  let text: string =
    langDict[resolved] || (translations.en as any)[resolved] ||
    langDict[key] || translations.en[key] || (key as string);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.split('{' + k + '}').join(String(v));
    });
  }
  return text;
}

export default t;
