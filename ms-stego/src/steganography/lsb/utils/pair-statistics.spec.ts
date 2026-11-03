import { collectRgbHistograms } from './rgb-histogram.js';
import { calculatePairStatistics } from './pair-statistics.js';

describe('RGB pair statistics', () => {
  it('counts each channel independently and excludes alpha', () => {
    const histograms = collectRgbHistograms(
      Uint8Array.from([2, 3, 4, 255, 3, 3, 5, 0]),
    );
    expect(histograms.map((channel) => channel.oneCount)).toEqual([1, 2, 1]);
    expect(histograms.map((channel) => channel.sampleCount)).toEqual([2, 2, 2]);
    expect(histograms[0]!.counts[2]).toBe(1);
    expect(histograms[0]!.counts[3]).toBe(1);
    expect(histograms[0]!.counts[255]).toBe(0);
  });

  it('uses both categories and one degree per eligible pair', () => {
    const counts = new Uint32Array(256);
    counts[0] = 15;
    counts[1] = 5;
    counts[2] = 5;
    counts[3] = 5;
    counts[4] = 2;
    const result = calculatePairStatistics(
      { channel: 'red', counts, sampleCount: 32, oneCount: 10 },
      5,
    );
    expect(result).toEqual({
      chiSquare: 5,
      eligiblePairs: 2,
      includedSamples: 30,
      coverage: 30 / 32,
    });
  });

  it('excludes sparse pairs instead of dividing by zero', () => {
    const histogram = collectRgbHistograms(Uint8Array.from([2, 3, 4, 255]))[0]!;
    expect(calculatePairStatistics(histogram, 5)).toEqual({
      chiSquare: 0,
      eligiblePairs: 0,
      includedSamples: 0,
      coverage: 0,
    });
  });

  it.each([new Uint8Array(), new Uint8Array(3)])(
    'rejects invalid RGBA buffers',
    (pixels) => {
      expect(() => collectRgbHistograms(pixels)).toThrow(RangeError);
    },
  );
});
