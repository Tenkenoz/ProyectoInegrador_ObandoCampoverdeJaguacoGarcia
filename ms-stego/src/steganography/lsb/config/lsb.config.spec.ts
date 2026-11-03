import { validateLsbConfiguration } from './lsb.config.js';

describe('LSB configuration', () => {
  it('uses explicit statistical and evidence defaults', () => {
    expect(validateLsbConfiguration({})).toMatchObject({
      LSB_SUSPICIOUS_THRESHOLD: 0.05,
      LSB_CLEAR_THRESHOLD: 0.001,
      LSB_MIN_PIXELS: 4096,
      LSB_MIN_EXPECTED_COUNT: 5,
      LSB_MIN_PAIRS: 32,
      LSB_MIN_COVERAGE: 0.8,
    });
  });

  it.each([
    { LSB_SUSPICIOUS_THRESHOLD: 0 },
    { LSB_CLEAR_THRESHOLD: 0.1 },
    { LSB_MIN_EXPECTED_COUNT: 4 },
    { LSB_MIN_PAIRS: 129 },
    { LSB_MIN_COVERAGE: 0.2 },
    { LSB_MIN_PIXELS: 0 },
    { LSB_BALANCE_TOLERANCE: 0.5 },
  ])('rejects unsafe settings %j', (values) => {
    expect(() => validateLsbConfiguration(values)).toThrow(
      'Invalid LSB configuration',
    );
  });
});
