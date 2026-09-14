import { create } from 'zustand';
import {
  DEFAULTS,
  findSilences,
  timeSaved,
  toKeepSegments,
  type DetectOptions,
  type Interval,
} from '../engine/silenceDetector';

/** Seconds of video a free user can cut in one export. */
export const FREE_SECONDS = 60;

/**
 * How much audio each energy reading covers.
 *
 * Short enough to land a cut inside the gap between two words, long enough that
 * a single loud sample cannot make a silence look like speech.
 */
export const WINDOW_SECONDS = 0.05;

/**
 * Sensitivity presets, from "only real pauses" to "every gap".
 *
 * The middle one is the detector's own defaults rather than a second opinion
 * about them, so the setting the app starts on is the setting it shows.
 */
export const SENSITIVITY = [
  { label: '1', thresholdDb: -45, minSilenceSeconds: 0.8 },
  { label: '2', thresholdDb: -40, minSilenceSeconds: 0.5 },
  { label: '3', thresholdDb: DEFAULTS.thresholdDb, minSilenceSeconds: DEFAULTS.minSilenceSeconds },
  { label: '4', thresholdDb: -30, minSilenceSeconds: 0.2 },
  { label: '5', thresholdDb: -25, minSilenceSeconds: 0.15 },
];

export const DEFAULT_SENSITIVITY = SENSITIVITY[2];

export type Stage = 'idle' | 'analysing' | 'cutting';

export interface Source {
  uri: string;
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  hasAudio: boolean;
}

interface CutState {
  source: Source | null;
  silences: Interval[];
  keep: Interval[];
  savedSeconds: number;
  options: DetectOptions;
  outputUri: string | null;
  outputDuration: number | null;
  stage: Stage;
  progress: number;
  isPro: boolean;

  setSource: (source: Source | null) => void;
  analyse: (profile: ArrayLike<number>) => void;
  setOptions: (options: DetectOptions) => void;
  setResult: (uri: string, duration: number) => void;
  setStage: (stage: Stage, progress?: number) => void;
  setProgress: (progress: number) => void;
  setIsPro: (pro: boolean) => void;
  reset: () => void;

  /** Whether the loaded video is longer than the free tier allows. */
  overFreeLimit: () => boolean;
  /** The segments the current entitlement actually allows exporting. */
  exportableKeep: () => Interval[];
}

const recompute = (profile: ArrayLike<number>, duration: number, options: DetectOptions) => {
  const silences = findSilences(profile, WINDOW_SECONDS, options);
  const keep = toKeepSegments(silences, duration, options);
  return { silences, keep, savedSeconds: timeSaved(keep, duration) };
};

export const useCutStore = create<CutState>((set, get) => {
  // Typed as ArrayLike because that is all this needs: the detector reads it
  // by index and length, and pinning it to Float32Array drags in the buffer
  // type parameter for no benefit.
  let profile: ArrayLike<number> = [];

  return {
    source: null,
    silences: [],
    keep: [],
    savedSeconds: 0,
    options: {
      thresholdDb: DEFAULT_SENSITIVITY.thresholdDb,
      minSilenceSeconds: DEFAULT_SENSITIVITY.minSilenceSeconds,
    },
    outputUri: null,
    outputDuration: null,
    stage: 'idle',
    progress: 0,
    isPro: false,

    // A new video clears the previous analysis outright. Leaving the old
    // segment list beside a new file is how the wrong export gets saved.
    setSource: (source) => {
      profile = [];
      set({ source, silences: [], keep: [], savedSeconds: 0, outputUri: null, outputDuration: null, stage: 'idle', progress: 0 });
    },

    analyse: (next) => {
      profile = next;
      const { source, options } = get();
      if (!source) return;
      set({ ...recompute(profile, source.duration, options), stage: 'idle', progress: 0 });
    },

    // Re-derived from the stored profile rather than re-decoding: the audio has
    // not changed, only the thresholds, and a slider that waits on a decode is
    // a slider nobody moves twice.
    setOptions: (options) => {
      const { source } = get();
      const merged = { ...get().options, ...options };
      if (!source || !profile.length) {
        set({ options: merged });
        return;
      }
      set({ options: merged, ...recompute(profile, source.duration, merged) });
    },

    setResult: (uri, duration) => set({ outputUri: uri, outputDuration: duration, stage: 'idle', progress: 1 }),
    setStage: (stage, progress = 0) => set({ stage, progress }),
    setProgress: (progress) => set({ progress }),
    setIsPro: (pro) => set({ isPro: pro }),
    reset: () => {
      profile = [];
      set({ source: null, silences: [], keep: [], savedSeconds: 0, outputUri: null, outputDuration: null, stage: 'idle', progress: 0 });
    },

    overFreeLimit: () => {
      const { source, isPro } = get();
      return !isPro && !!source && source.duration > FREE_SECONDS;
    },

    exportableKeep: () => {
      const { keep, isPro } = get();
      if (isPro) return keep;
      // Truncated at the free limit rather than dropped whole, so the free tier
      // produces a real cut of the opening minute instead of nothing.
      const limited: Interval[] = [];
      for (const segment of keep) {
        if (segment.start >= FREE_SECONDS) break;
        limited.push({ start: segment.start, end: Math.min(segment.end, FREE_SECONDS) });
      }
      return limited;
    },
  };
});
