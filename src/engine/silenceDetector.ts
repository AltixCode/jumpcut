/**
 * Turns an audio energy profile into the list of segments worth keeping.
 *
 * The native side decodes the audio track to PCM and reports one RMS value per
 * window; everything from there is arithmetic, which is why it lives here and
 * is tested rather than buried in Swift and Kotlin twice.
 *
 * The spec's first suggestion was FFmpeg's silencedetect filter. FFmpegKit's
 * binaries were withdrawn from both Maven and CocoaPods, so this takes the
 * spec's own alternative -- RMS dBFS over raw PCM -- which the platform audio
 * APIs supply directly.
 */

export interface Interval {
  start: number;
  end: number;
}

export interface DetectOptions {
  /** Below this, a window counts as silent. Typical speech sits well above. */
  thresholdDb?: number;
  /** Silences shorter than this are natural speech rhythm, not dead air. */
  minSilenceSeconds?: number;
  /**
   * Kept either side of every speech segment. Cutting exactly on the threshold
   * clips the attack of the first word and the release of the last, which is
   * the single most obvious sign of an automated cut.
   */
  paddingSeconds?: number;
  /** Speech shorter than this is a click or a breath, not a sentence. */
  minSegmentSeconds?: number;
}

/**
 * Exported so the UI can present the defaults as a chosen setting rather than
 * an implicit one. A screen that hardcodes its own copy of these shows a
 * sensitivity nothing is set to.
 */
export const DEFAULTS: Required<DetectOptions> = {
  thresholdDb: -35,
  minSilenceSeconds: 0.3,
  paddingSeconds: 0.04,
  minSegmentSeconds: 0.15,
};

/**
 * Rounds to microseconds, the precision both muxers actually work in
 * (CMTime on iOS, microsecond sample times on Android).
 *
 * Window index times window length accumulates binary error -- seven windows of
 * 0.1s comes out as 0.7000000000000001 -- and handing that to a muxer as a cut
 * point is asking for an off-by-one-sample seek. Rounding here keeps the
 * engine's output in the units its consumer uses.
 */
const atMicros = (seconds: number): number => Math.round(seconds * 1e6) / 1e6;

/** Linear RMS (0..1) to dBFS. Silence is -Infinity, not an error. */
export const rmsToDb = (rms: number): number =>
  rms <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(rms);

/**
 * Finds runs of windows quiet enough, and long enough, to be dead air.
 *
 * `windowSeconds` is the duration each RMS sample covers.
 */
export const findSilences = (
  // ArrayLike rather than number[]: the profile arrives as a Float32Array of
  // one reading per 50 ms, and converting a few thousand of those into a JS
  // array to read them once is work with no result.
  rmsWindows: ArrayLike<number>,
  windowSeconds: number,
  options: DetectOptions = {},
): Interval[] => {
  const { thresholdDb, minSilenceSeconds } = { ...DEFAULTS, ...options };
  const silences: Interval[] = [];
  let runStart: number | null = null;

  for (let i = 0; i < rmsWindows.length; i += 1) {
    const rms = rmsWindows[i];
    const quiet = rmsToDb(rms) < thresholdDb;
    if (quiet && runStart === null) runStart = i;
    if (!quiet && runStart !== null) {
      const start = atMicros(runStart * windowSeconds);
      const end = atMicros(i * windowSeconds);
      if (end - start >= minSilenceSeconds) silences.push({ start, end });
      runStart = null;
    }
  }
  // A silence running to the end of the file never sees a loud window to close
  // it, so it has to be closed explicitly or trailing dead air is kept.
  if (runStart !== null) {
    const start = atMicros(runStart * windowSeconds);
    const end = atMicros(rmsWindows.length * windowSeconds);
    if (end - start >= minSilenceSeconds) silences.push({ start, end });
  }
  return silences;
};

/**
 * Inverts silences into the speech segments to keep, padded and merged.
 *
 * Padding can make neighbouring segments touch or overlap; those are merged,
 * because two adjacent segments would otherwise be concatenated with a
 * redundant cut point between them.
 */
export const toKeepSegments = (
  silences: Interval[],
  durationSeconds: number,
  options: DetectOptions = {},
): Interval[] => {
  const { paddingSeconds, minSegmentSeconds } = { ...DEFAULTS, ...options };
  const ordered = [...silences].sort((a, b) => a.start - b.start);

  const speech: Interval[] = [];
  let cursor = 0;
  for (const silence of ordered) {
    if (silence.start > cursor)
      speech.push({
        start: cursor,
        end: Math.min(silence.start, durationSeconds),
      });
    cursor = Math.max(cursor, silence.end);
  }
  if (cursor < durationSeconds)
    speech.push({ start: cursor, end: durationSeconds });

  const padded = speech
    .map((s) => ({
      start: atMicros(Math.max(0, s.start - paddingSeconds)),
      end: atMicros(Math.min(durationSeconds, s.end + paddingSeconds)),
    }))
    .filter((s) => s.end - s.start >= minSegmentSeconds);

  const merged: Interval[] = [];
  for (const segment of padded) {
    const last = merged[merged.length - 1];
    if (last && segment.start <= last.end)
      last.end = Math.max(last.end, segment.end);
    else merged.push({ ...segment });
  }
  return merged;
};

/** Seconds removed by keeping only these segments. */
export const timeSaved = (keep: Interval[], durationSeconds: number): number =>
  Math.max(
    0,
    durationSeconds - keep.reduce((total, s) => total + (s.end - s.start), 0),
  );

/**
 * Nudges the very first or very last cut point of the final export by a
 * small amount, on top of whatever silence detection already produced.
 *
 * This is the preview screen's fine-edit control: it does not re-run
 * detection or touch any segment in the middle, only the one edge of the
 * whole clip the user is looking at. `deltaSeconds` is added directly to
 * that edge's timestamp -- positive trims into the clip, negative restores
 * toward the original bound -- and is always clamped so the edited segment
 * never inverts or drops below the minimum a cut is allowed to be.
 */
export const adjustEdgeTrim = (
  segments: Interval[],
  edge: "start" | "end",
  deltaSeconds: number,
  durationSeconds: number,
  options: DetectOptions = {},
): Interval[] => {
  if (!segments.length) return [];
  const { minSegmentSeconds } = { ...DEFAULTS, ...options };
  const result = segments.map((s) => ({ ...s }));

  if (edge === "start") {
    const first = result[0];
    const maxStart = Math.max(0, atMicros(first.end - minSegmentSeconds));
    first.start = atMicros(
      Math.min(Math.max(0, first.start + deltaSeconds), maxStart),
    );
  } else {
    const last = result[result.length - 1];
    const minEnd = Math.min(
      durationSeconds,
      atMicros(last.start + minSegmentSeconds),
    );
    last.end = atMicros(
      Math.min(durationSeconds, Math.max(minEnd, last.end + deltaSeconds)),
    );
  }

  return result;
};
