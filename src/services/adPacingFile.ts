import * as FileSystem from 'expo-file-system/legacy';
import { EMPTY_PACING, parsePacing, serialisePacing, type PacingState } from './adPacing';

/**
 * Where the pacing counters live. A two-number JSON file in app storage rather than a new
 * native dependency: the counters are not worth an AsyncStorage rebuild. Losing the file costs one skipped interstitial.
 */
const pacingPath = () =>
  `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}ad-pacing.json`;

export async function readPacing(): Promise<PacingState> {
  try {
    const info = await FileSystem.getInfoAsync(pacingPath());
    if (!info.exists) return EMPTY_PACING;
    return parsePacing(await FileSystem.readAsStringAsync(pacingPath()));
  } catch {
    return EMPTY_PACING;
  }
}

export async function writePacing(state: PacingState): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(pacingPath(), serialisePacing(state));
  } catch {
    // Pacing that fails to persist degrades to per-launch pacing, which is strictly fewer ads.
  }
}
