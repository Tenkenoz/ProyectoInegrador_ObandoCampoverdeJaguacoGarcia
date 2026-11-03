import { validateLsbConfiguration } from '../config/lsb.config.js';
import { classifyLsb } from './classify-lsb.js';
import { detectLsb } from './detect-lsb.js';

const config = validateLsbConfiguration({});

function pixelsWithPairedValues(balanced: boolean) {
  const pixels = new Uint8Array(4096 * 4);
  for (let index = 0; index < 4096; index++) {
    const value =
      2 * (index % 128) + (balanced ? Math.floor(index / 128) % 2 : 0);
    pixels.set([value, value, value, index % 256], index * 4);
  }
  return pixels;
}

describe('LSB evidence and classifications', () => {
  it('identifies perfectly balanced pairs as compatible, without claiming proof', () => {
    const result = detectLsb(pixelsWithPairedValues(true), config);
    expect(result.status).toBe('sospechoso');
    expect(result.indicators).toMatchObject({
      chi_square: 0,
      degrees_of_freedom: 384,
      p_value: 1,
      anomaly_score: 1,
      lsb_ratio: 0.5,
      pixel_count: 4096,
      sample_count: 12288,
      coverage: 1,
    });
    expect(result.limitations.join(' ')).toContain('not proof');
  });

  it('rejects the balance hypothesis for strongly biased pairs', () => {
    const result = detectLsb(pixelsWithPairedValues(false), config);
    expect(result.status).toBe('sin_indicios');
    expect(result.indicators.p_value).toBe(0);
    expect(result.indicators.lsb_ratio).toBe(0);
  });

  it('ignores alpha changes', () => {
    const pixels = pixelsWithPairedValues(true);
    const before = detectLsb(pixels, config);
    for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
    expect(detectLsb(pixels, config)).toEqual(before);
  });

  it('returns inconclusive evidence for small or low-diversity images', () => {
    expect(detectLsb(new Uint8Array(16 * 16 * 4), config)).toMatchObject({
      status: 'no_concluyente',
      reason: 'insufficient_samples',
    });
    expect(detectLsb(new Uint8Array(4096 * 4), config)).toMatchObject({
      status: 'no_concluyente',
      reason: 'insufficient_pair_coverage',
    });
  });

  it('does not manufacture probabilities when no pairs qualify', () => {
    const result = detectLsb(Uint8Array.from([1, 2, 3, 255]), config);
    expect(result.indicators.p_value).toBeNull();
    expect(result.indicators.anomaly_score).toBeNull();
  });

  it('supports ambiguous and numerical-error classifications', () => {
    const result = detectLsb(pixelsWithPairedValues(true), config);
    expect(
      classifyLsb(
        { ...result.indicators, p_value: 0.01 },
        result.channels,
        config,
      ).status,
    ).toBe('no_concluyente');
    expect(
      classifyLsb(
        { ...result.indicators, p_value: NaN },
        result.channels,
        config,
      ).status,
    ).toBe('error');
    expect(
      classifyLsb(
        { ...result.indicators, lsb_ratio: 0.7 },
        result.channels,
        config,
      ).status,
    ).toBe('no_concluyente');
  });

  it('honors threshold boundaries', () => {
    const result = detectLsb(pixelsWithPairedValues(true), config);
    expect(
      classifyLsb(
        { ...result.indicators, p_value: config.LSB_SUSPICIOUS_THRESHOLD },
        result.channels,
        config,
      ).status,
    ).toBe('sospechoso');
    expect(
      classifyLsb(
        { ...result.indicators, p_value: config.LSB_CLEAR_THRESHOLD },
        result.channels,
        config,
      ).status,
    ).toBe('sin_indicios');
  });

  it('reports invalid pixel data as an error', () => {
    expect(detectLsb(new Uint8Array(3), config)).toMatchObject({
      status: 'error',
      reason: 'invalid_pixel_data',
    });
  });
});
