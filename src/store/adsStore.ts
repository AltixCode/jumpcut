import { create } from 'zustand';
import type { ConsentSummary } from '../services/consentPolicy';
import { EMPTY_PACING } from '../services/adPacing';
import { readPacing, writePacing } from '../services/adPacingFile';

export interface AdsState {
  /** Mirrors the UMP consent state so components can react to it. */
  consent: ConsentSummary;
  /** Successful completions on this device, across launches. Paces the interstitial. */
  completions: number;
  lastInterstitialAt: number;
  setConsent: (consent: ConsentSummary) => void;
  /** Loads the persisted counters. Safe to call more than once. */
  hydrate: () => Promise<void>;
  recordCompletion: () => Promise<void>;
  markInterstitialShown: () => Promise<void>;
  resetForTests: () => void;
}

const INITIAL: ConsentSummary = { canServeAds: false, offerPrivacyOptions: false };

async function persist(state: { completions: number; lastInterstitialAt: number }) {
  await writePacing({
    completions: state.completions,
    lastInterstitialAt: state.lastInterstitialAt,
  });
}

export const useAdsStore = create<AdsState>((set, get) => ({
  consent: INITIAL,
  completions: EMPTY_PACING.completions,
  lastInterstitialAt: EMPTY_PACING.lastInterstitialAt,

  setConsent: (consent) => set({ consent }),

  hydrate: async () => {
    const pacing = await readPacing();
    set(pacing);
  },

  recordCompletion: async () => {
    // Counted here rather than inside the interstitial decision so that finished work always
    // advances the cadence, whether or not an ad was available to fill it.
    const completions = get().completions + 1;
    set({ completions });
    await persist({ completions, lastInterstitialAt: get().lastInterstitialAt });
  },

  markInterstitialShown: async () => {
    const lastInterstitialAt = Date.now();
    set({ lastInterstitialAt });
    await persist({ completions: get().completions, lastInterstitialAt });
  },

  resetForTests: () => set({ consent: INITIAL, ...EMPTY_PACING }),
}));
