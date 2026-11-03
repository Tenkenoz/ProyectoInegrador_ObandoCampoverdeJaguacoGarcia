import type {
  ChannelHistogram,
  PairStatistics,
} from '../interfaces/rgb-histogram.js';

export function calculatePairStatistics(
  histogram: ChannelHistogram,
  minimumExpectedCount: number,
): PairStatistics {
  let chiSquare = 0;
  let eligiblePairs = 0;
  let includedSamples = 0;
  for (let even = 0; even < 256; even += 2) {
    const first = histogram.counts[even]!;
    const second = histogram.counts[even + 1]!;
    const total = first + second;
    if (total < 2 * minimumExpectedCount) continue;
    chiSquare += (first - second) ** 2 / total;
    eligiblePairs++;
    includedSamples += total;
  }
  return {
    chiSquare,
    eligiblePairs,
    includedSamples,
    coverage: histogram.sampleCount
      ? includedSamples / histogram.sampleCount
      : 0,
  };
}
