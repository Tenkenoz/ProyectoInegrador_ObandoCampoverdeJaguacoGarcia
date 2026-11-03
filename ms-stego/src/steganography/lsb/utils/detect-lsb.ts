import type { LsbConfiguration } from '../config/lsb.config.js';
import type { ChannelEvidence, LsbResult } from '../interfaces/lsb-result.js';
import { chiSquareSurvival } from './chi-square.js';
import { classifyLsb } from './classify-lsb.js';
import { calculatePairStatistics } from './pair-statistics.js';
import { collectRgbHistograms } from './rgb-histogram.js';

export const LSB_LIMITATIONS = [
  'Statistical compatibility is an indication, not proof of hidden data.',
  'Natural noise and image processing can produce false positives.',
  'Partial, localized, single-channel, nonrandom or LSB-matching payloads may evade this test.',
  'Pixel dependencies make chi-square probabilities approximate.',
  'A sin_indicios result does not establish that an image is safe.',
];

function errorResult(
  config: LsbConfiguration,
  reason: 'invalid_pixel_data' | 'numerical_failure',
  pixelCount = 0,
): LsbResult {
  return {
    technique: 'lsb_chi_square_v1',
    status: 'error',
    reason,
    indicators: {
      chi_square: null,
      degrees_of_freedom: 0,
      p_value: null,
      anomaly_score: null,
      lsb_ratio: null,
      threshold: config.LSB_SUSPICIOUS_THRESHOLD,
      clear_threshold: config.LSB_CLEAR_THRESHOLD,
      balance_tolerance: config.LSB_BALANCE_TOLERANCE,
      pixel_count: pixelCount,
      sample_count: pixelCount * 3,
      coverage: 0,
    },
    channels: [],
    limitations: [...LSB_LIMITATIONS],
  };
}

export function detectLsb(
  pixels: Uint8Array,
  config: LsbConfiguration,
): LsbResult {
  if (!pixels.length || pixels.length % 4 !== 0)
    return errorResult(config, 'invalid_pixel_data');
  try {
    const histograms = collectRgbHistograms(pixels);
    const statistics = histograms.map((histogram) =>
      calculatePairStatistics(histogram, config.LSB_MIN_EXPECTED_COUNT),
    );
    const channels: ChannelEvidence[] = histograms.map((histogram, index) => {
      const pairs = statistics[index]!;
      return {
        channel: histogram.channel,
        sample_count: histogram.sampleCount,
        eligible_pairs: pairs.eligiblePairs,
        coverage: pairs.coverage,
        chi_square: pairs.chiSquare,
        p_value: pairs.eligiblePairs
          ? chiSquareSurvival(pairs.chiSquare, pairs.eligiblePairs)
          : null,
        lsb_ratio: histogram.oneCount / histogram.sampleCount,
      };
    });
    const chiSquare = statistics.reduce(
      (sum, pairs) => sum + pairs.chiSquare,
      0,
    );
    const degrees = statistics.reduce(
      (sum, pairs) => sum + pairs.eligiblePairs,
      0,
    );
    const pixelCount = pixels.length / 4;
    const sampleCount = pixelCount * 3;
    const probability = degrees ? chiSquareSurvival(chiSquare, degrees) : null;
    const indicators = {
      chi_square: degrees ? chiSquare : null,
      degrees_of_freedom: degrees,
      p_value: probability,
      anomaly_score: probability,
      lsb_ratio:
        histograms.reduce((sum, histogram) => sum + histogram.oneCount, 0) /
        sampleCount,
      threshold: config.LSB_SUSPICIOUS_THRESHOLD,
      clear_threshold: config.LSB_CLEAR_THRESHOLD,
      balance_tolerance: config.LSB_BALANCE_TOLERANCE,
      pixel_count: pixelCount,
      sample_count: sampleCount,
      coverage:
        statistics.reduce((sum, pairs) => sum + pairs.includedSamples, 0) /
        sampleCount,
    };
    return {
      technique: 'lsb_chi_square_v1',
      ...classifyLsb(indicators, channels, config),
      indicators,
      channels,
      limitations: [...LSB_LIMITATIONS],
    };
  } catch {
    return errorResult(config, 'numerical_failure', pixels.length / 4);
  }
}
