/**
 * Every failure mode here produces a video that plays fine and is subtly wrong
 * -- clipped words, kept dead air, or a cut list that silently drops the end of
 * the take. None of them are visible in a screenshot.
 */
import { rmsToDb, findSilences, toKeepSegments, timeSaved } from '../silenceDetector';

const LOUD = 0.2;   // about -14 dBFS, ordinary speech
const QUIET = 0.001; // about -60 dBFS, room tone

describe('rmsToDb', () => {
  it('maps full scale to 0 dB', () => expect(rmsToDb(1)).toBe(0));
  it('treats digital silence as -Infinity rather than erroring', () =>
    expect(rmsToDb(0)).toBe(Number.NEGATIVE_INFINITY));
  it('is monotonic', () => expect(rmsToDb(0.5)).toBeGreaterThan(rmsToDb(0.05)));
});

describe('findSilences', () => {
  it('finds a silence long enough to matter', () => {
    // 10 windows of 0.1s: loud, then 0.5s quiet, then loud.
    const windows = [LOUD, LOUD, QUIET, QUIET, QUIET, QUIET, QUIET, LOUD, LOUD, LOUD];
    expect(findSilences(windows, 0.1)).toEqual([{ start: 0.2, end: 0.7 }]);
  });

  it('ignores a pause shorter than the minimum', () => {
    // A single 0.1s gap is speech rhythm, not dead air; cutting it makes the
    // result sound clipped and unnatural.
    const windows = [LOUD, QUIET, LOUD, LOUD];
    expect(findSilences(windows, 0.1)).toEqual([]);
  });

  it('closes a silence that runs to the end of the file', () => {
    // Nothing loud follows it, so without an explicit close the trailing dead
    // air is kept in the cut.
    const windows = [LOUD, LOUD, QUIET, QUIET, QUIET, QUIET];
    expect(findSilences(windows, 0.1)).toEqual([{ start: 0.2, end: 0.6 }]);
  });

  it('handles audio that is silent throughout', () => {
    expect(findSilences([QUIET, QUIET, QUIET, QUIET], 0.1)).toEqual([{ start: 0, end: 0.4 }]);
  });

  it('returns nothing for audio with no silence', () => {
    expect(findSilences([LOUD, LOUD, LOUD], 0.1)).toEqual([]);
  });

  it('honours a custom threshold', () => {
    // At -70 dB the room tone no longer counts as silence.
    expect(findSilences([LOUD, QUIET, QUIET, QUIET, QUIET, LOUD], 0.1, { thresholdDb: -70 })).toEqual([]);
  });
});

describe('toKeepSegments', () => {
  it('inverts silences into speech and pads both edges', () => {
    const keep = toKeepSegments([{ start: 2, end: 3 }], 5, { paddingSeconds: 0.04 });
    expect(keep).toEqual([
      { start: 0, end: 2.04 },
      { start: 2.96, end: 5 },
    ]);
  });

  it('never pads past the start or end of the file', () => {
    const keep = toKeepSegments([{ start: 1, end: 2 }], 3, { paddingSeconds: 0.5 });
    expect(keep[0].start).toBe(0);
    expect(keep[keep.length - 1].end).toBe(3);
  });

  it('merges segments that padding pushed into each other', () => {
    // A 0.05s silence with 0.04s padding either side leaves no real gap;
    // emitting two segments would put a pointless cut in the middle of a word.
    const keep = toKeepSegments([{ start: 1, end: 1.05 }], 3, { paddingSeconds: 0.04 });
    expect(keep).toEqual([{ start: 0, end: 3 }]);
  });

  it('drops slivers too short to be speech', () => {
    const keep = toKeepSegments(
      [{ start: 0, end: 1 }, { start: 1.05, end: 3 }],
      3,
      { paddingSeconds: 0, minSegmentSeconds: 0.15 },
    );
    expect(keep).toEqual([]);
  });

  it('keeps the whole file when there is no silence', () => {
    expect(toKeepSegments([], 4)).toEqual([{ start: 0, end: 4 }]);
  });

  it('returns nothing when the file is silent end to end', () => {
    expect(toKeepSegments([{ start: 0, end: 4 }], 4)).toEqual([]);
  });

  it('tolerates unsorted silences', () => {
    const keep = toKeepSegments([{ start: 3, end: 3.5 }, { start: 1, end: 1.5 }], 5, { paddingSeconds: 0 });
    expect(keep).toEqual([
      { start: 0, end: 1 },
      { start: 1.5, end: 3 },
      { start: 3.5, end: 5 },
    ]);
  });
});

describe('timeSaved', () => {
  it('reports the seconds removed', () => {
    expect(timeSaved([{ start: 0, end: 2 }, { start: 3, end: 5 }], 5)).toBe(1);
  });
  it('never reports a negative saving', () => {
    expect(timeSaved([{ start: 0, end: 10 }], 5)).toBe(0);
  });
});
