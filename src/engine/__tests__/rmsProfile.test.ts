import { rmsProfile, toMono } from '../rmsProfile';

const constant = (value: number, count: number) => {
  const samples = new Float32Array(count);
  samples.fill(value);
  return samples;
};

describe('rmsProfile', () => {
  it('measures the RMS of each window', () => {
    // 100 samples at 100 Hz with a 0.5s window is two windows of 50.
    const samples = new Float32Array(100);
    samples.fill(0.5, 0, 50);
    samples.fill(0.1, 50, 100);
    const profile = rmsProfile(samples, 100, 0.5);
    expect(profile).toHaveLength(2);
    expect(profile[0]).toBeCloseTo(0.5, 6);
    expect(profile[1]).toBeCloseTo(0.1, 6);
  });

  it('reports zero for silence rather than failing', () => {
    expect(Array.from(rmsProfile(constant(0, 50), 100, 0.5))).toEqual([0]);
  });

  it('measures a trailing partial window over what it actually holds', () => {
    // 60 samples, 0.5s windows at 100 Hz: a full window then ten samples.
    const samples = new Float32Array(60);
    samples.fill(0, 0, 50);
    samples.fill(0.8, 50, 60);
    const profile = rmsProfile(samples, 100, 0.5);
    expect(profile).toHaveLength(2);
    // Zero-padding the last window to 50 samples would report 0.358 here and
    // the end of a recording would read as silence -- which is where a cut
    // would take the final word off.
    expect(profile[1]).toBeCloseTo(0.8, 6);
  });

  it('uses RMS, not mean amplitude', () => {
    // Half the samples at full scale and half at zero. Mean amplitude is 0.5,
    // RMS is 0.707 -- a square wave between +1 and -1 would not tell the two
    // apart, since its mean absolute amplitude is 1 as well.
    const samples = new Float32Array(100);
    samples.fill(1, 0, 50);
    expect(rmsProfile(samples, 100, 1)[0]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('returns nothing for empty or nonsensical input', () => {
    expect(rmsProfile(new Float32Array(0), 100, 0.5)).toHaveLength(0);
    expect(rmsProfile(constant(0.5, 10), 0, 0.5)).toHaveLength(0);
    expect(rmsProfile(constant(0.5, 10), 100, 0)).toHaveLength(0);
  });

  it('never produces a zero-length window', () => {
    // A window shorter than one sample still has to cover one.
    expect(rmsProfile(constant(0.5, 10), 100, 0.0001)).toHaveLength(10);
  });
});

describe('toMono', () => {
  const int16 = (values: number[]) => {
    const bytes = new Uint8Array(values.length * 2);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setInt16(index * 2, value, true));
    return bytes;
  };

  it('scales to -1..1', () => {
    expect(Array.from(toMono(int16([16384]), 1))).toEqual([0.5]);
  });

  it('averages channels', () => {
    expect(Array.from(toMono(int16([16384, 0]), 2))).toEqual([0.25]);
  });

  it('keeps a full-scale negative sample inside the range', () => {
    // Dividing by 32767 would make this -1.00003, which squares to more than
    // full scale and reads as louder than anything can be.
    expect(toMono(int16([-32768]), 1)[0]).toBe(-1);
  });

  it('ignores a trailing partial frame', () => {
    const bytes = new Uint8Array(6);
    expect(toMono(bytes, 2)).toHaveLength(1);
  });
});
