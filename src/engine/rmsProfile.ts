/**
 * Turns decoded audio into the energy profile the silence detector reads.
 *
 * This is here rather than in Swift and Kotlin for the same reason the detector
 * is: it is arithmetic, and arithmetic written twice is arithmetic that differs
 * on one platform. The native side decodes; everything after that is tested.
 */

/**
 * One RMS value per window of `windowSeconds`.
 *
 * A trailing partial window is measured over the samples it actually has rather
 * than being padded with zeros. Padding would drag the last window's energy
 * down and report the end of a recording as silence, which is exactly where a
 * cut would remove the final word.
 */
export const rmsProfile = (
  samples: Float32Array,
  sampleRate: number,
  windowSeconds: number,
): Float32Array => {
  if (!samples.length || sampleRate <= 0 || windowSeconds <= 0) return new Float32Array(0);

  const windowSamples = Math.max(1, Math.round(windowSeconds * sampleRate));
  const windows = Math.ceil(samples.length / windowSamples);
  const profile = new Float32Array(windows);

  for (let window = 0; window < windows; window += 1) {
    const start = window * windowSamples;
    const end = Math.min(start + windowSamples, samples.length);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      sum += samples[index] * samples[index];
    }
    profile[window] = Math.sqrt(sum / (end - start));
  }

  return profile;
};

/** Interleaved Int16 bytes to the mono Float32 the profile works in. */
export const toMono = (bytes: Uint8Array, channels: number): Float32Array => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(bytes.byteLength / 2 / channels);
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16((frame * channels + channel) * 2, true);
    }
    // 32768 rather than 32767: the negative extreme is what clips first, and
    // dividing by 32767 lets a full-scale negative sample come back above 1.0.
    mono[frame] = sum / channels / 32768;
  }
  return mono;
};
