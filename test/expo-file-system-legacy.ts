/// <reference types="jest" />
/**
 * Stands in for expo-file-system/legacy under Jest, as an in-memory filesystem.
 *
 * Real enough for the pacing counters: a missing file reads as missing, a written file reads
 * back byte for byte. The parsing rules those bytes go through are tested directly in
 * adPacing.test.ts.
 */
const files = new Map<string, string>();

export const documentDirectory = 'file:///test/';
export const cacheDirectory = 'file:///test-cache/';

export const getInfoAsync = jest.fn(async (uri: string) => ({
  exists: files.has(uri),
  uri,
  size: files.get(uri)?.length ?? 0,
}));

export const readAsStringAsync = jest.fn(async (uri: string) => {
  const contents = files.get(uri);
  if (contents === undefined) throw new Error(`ENOENT: ${uri}`);
  return contents;
});

export const writeAsStringAsync = jest.fn(async (uri: string, contents: string) => {
  files.set(uri, contents);
});

export const deleteAsync = jest.fn(async (uri: string) => {
  files.delete(uri);
});

export const makeDirectoryAsync = jest.fn(async () => undefined);
export const moveAsync = jest.fn(async ({ from, to }: { from: string; to: string }) => {
  const contents = files.get(from);
  if (contents !== undefined) {
    files.set(to, contents);
    files.delete(from);
  }
});

export const __reset = (): void => files.clear();
export const __files = files;
