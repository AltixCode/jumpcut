import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import type { Interval } from '../../src/engine/silenceDetector';

export interface VideoInfo {
  /** Seconds. */
  duration: number;
  /** Display size, with the camera's rotation already applied. */
  width: number;
  height: number;
  hasAudio: boolean;
}

export interface DecodedAudio {
  /** Interleaved 16-bit signed PCM, little endian. */
  samples: Uint8Array;
  sampleRate: number;
  channels: number;
}

export interface CutResult {
  uri: string;
  /** Duration of what was actually written, in seconds. */
  duration: number;
}

interface VideoCutterModule {
  getInfo(uri: string): Promise<VideoInfo>;
  /** Decodes the audio track so the silence detector has something to read. */
  decodeAudio(uri: string): Promise<DecodedAudio>;
  /** Writes only the given time ranges, joined end to end. */
  cut(uri: string, segments: string): Promise<CutResult>;
  addListener(
    event: 'onCutProgress',
    listener: (payload: { progress: number }) => void,
  ): EventSubscription;
}

/**
 * On-device silence cutting.
 *
 * Only three things are native: reading the file's properties, decoding its
 * audio, and writing the cut. Finding the silences and deciding what to keep
 * stays in TypeScript, where it is tested -- the same split as VoiceCrisp, and
 * for the same reason.
 *
 * The cuts land mid-sentence by design, so this cannot be a passthrough trim:
 * passthrough can only cut on sync samples, which on a 2-second keyframe
 * interval would move every cut by up to two seconds. The frames are
 * re-encoded.
 *
 * ffmpeg-kit's binaries were withdrawn from Maven and CocoaPods in 2025, so the
 * spec's suggested route is not installable; this uses the platform APIs
 * underneath it.
 */
export const cutter = requireNativeModule<VideoCutterModule>('VideoCutter');

export const encodeSegments = (segments: Interval[]): string => JSON.stringify(segments);

/** Progress of the cut, 0 to 1. */
export const onCutProgress = (listener: (progress: number) => void): EventSubscription =>
  cutter.addListener('onCutProgress', ({ progress }) => listener(progress));

export default cutter;
