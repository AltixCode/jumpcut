import {
  DEFAULT_SENSITIVITY,
  FREE_SECONDS,
  SENSITIVITY,
  WINDOW_SECONDS,
  useCutStore,
} from '../useCutStore';
import { DEFAULTS } from '../../engine/silenceDetector';

const SOURCE = { uri: 'file:///take.mov', width: 1080, height: 1920, duration: 10, hasAudio: true };

/** A profile with speech, then a two-second silence, then speech again. */
const profileWithGap = (seconds: number, gapFrom: number, gapTo: number) => {
  const windows = Math.round(seconds / WINDOW_SECONDS);
  const profile = new Float32Array(windows);
  for (let index = 0; index < windows; index += 1) {
    const time = index * WINDOW_SECONDS;
    profile[index] = time >= gapFrom && time < gapTo ? 0 : 0.3;
  }
  return profile;
};

beforeEach(() => {
  useCutStore.getState().reset();
  useCutStore.getState().setIsPro(false);
  useCutStore.getState().setOptions(DEFAULT_SENSITIVITY);
});

describe('useCutStore', () => {
  it('finds the silence and keeps what is around it', () => {
    useCutStore.getState().setSource(SOURCE);
    useCutStore.getState().analyse(profileWithGap(10, 4, 6));
    const { silences, keep, savedSeconds } = useCutStore.getState();
    expect(silences).toHaveLength(1);
    expect(keep).toHaveLength(2);
    expect(savedSeconds).toBeGreaterThan(1.5);
  });

  it('clears the previous analysis when a new video is loaded', () => {
    useCutStore.getState().setSource(SOURCE);
    useCutStore.getState().analyse(profileWithGap(10, 4, 6));
    useCutStore.getState().setSource({ ...SOURCE, uri: 'file:///other.mov' });
    expect(useCutStore.getState().keep).toEqual([]);
    expect(useCutStore.getState().savedSeconds).toBe(0);
  });

  it('re-derives the segments when the threshold changes, without a new profile', () => {
    useCutStore.getState().setSource(SOURCE);
    useCutStore.getState().analyse(profileWithGap(10, 4, 6));
    const before = useCutStore.getState().keep.length;
    // A threshold above the speech level makes the whole clip read as silence.
    useCutStore.getState().setOptions({ thresholdDb: 0 });
    expect(useCutStore.getState().keep.length).not.toBe(before);
  });

  it('keeps the options when there is nothing to re-derive from', () => {
    useCutStore.getState().setOptions({ thresholdDb: -25 });
    expect(useCutStore.getState().options.thresholdDb).toBe(-25);
    expect(useCutStore.getState().keep).toEqual([]);
  });

  it('flags a video past the free duration, and stops flagging once unlocked', () => {
    useCutStore.getState().setSource({ ...SOURCE, duration: FREE_SECONDS + 1 });
    expect(useCutStore.getState().overFreeLimit()).toBe(true);
    useCutStore.getState().setIsPro(true);
    expect(useCutStore.getState().overFreeLimit()).toBe(false);
  });

  it('truncates the free export at the limit rather than dropping segments', () => {
    useCutStore.getState().setSource({ ...SOURCE, duration: FREE_SECONDS + 30 });
    useCutStore.getState().analyse(profileWithGap(FREE_SECONDS + 30, 4, 6));
    const exportable = useCutStore.getState().exportableKeep();
    expect(exportable.length).toBeGreaterThan(0);
    // A free export is the opening minute, cut -- not nothing, and not a
    // segment that runs past what was paid for.
    expect(Math.max(...exportable.map((s) => s.end))).toBeLessThanOrEqual(FREE_SECONDS);
  });

  it('exports every segment once unlocked', () => {
    useCutStore.getState().setSource({ ...SOURCE, duration: FREE_SECONDS + 30 });
    useCutStore.getState().analyse(profileWithGap(FREE_SECONDS + 30, 4, 6));
    useCutStore.getState().setIsPro(true);
    expect(useCutStore.getState().exportableKeep()).toEqual(useCutStore.getState().keep);
  });

  it('reports nothing to keep for a clip that is silent throughout', () => {
    useCutStore.getState().setSource(SOURCE);
    useCutStore.getState().analyse(new Float32Array(Math.round(10 / WINDOW_SECONDS)));
    expect(useCutStore.getState().keep).toEqual([]);
  });

  it('starts on a sensitivity the UI can show as chosen', () => {
    // An empty options object would leave every preset unselected, and the
    // screen would show no setting while using one.
    const { options } = useCutStore.getState();
    expect(options.thresholdDb).toBe(DEFAULT_SENSITIVITY.thresholdDb);
    expect(SENSITIVITY.some((preset) => preset.thresholdDb === options.thresholdDb)).toBe(true);
  });

  it('keeps the default preset equal to the detector\'s own defaults', () => {
    // Two copies of the same numbers drift, and the drift is invisible: the
    // app would analyse with one threshold and display another.
    expect(DEFAULT_SENSITIVITY.thresholdDb).toBe(DEFAULTS.thresholdDb);
    expect(DEFAULT_SENSITIVITY.minSilenceSeconds).toBe(DEFAULTS.minSilenceSeconds);
  });
});
