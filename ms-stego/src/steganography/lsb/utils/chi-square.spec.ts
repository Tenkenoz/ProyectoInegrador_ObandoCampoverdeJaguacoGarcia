import { chiSquareSurvival } from './chi-square.js';

describe('Chi-square upper-tail probabilities', () => {
  it.each([
    [1, 3.841458820694124],
    [2, 5.991464547107979],
    [3, 7.814727903251179],
    [4, 9.487729036781154],
    [10, 18.307038053275146],
  ])(
    'matches the 5 percent reference quantile for %i degrees',
    (degrees, statistic) => {
      expect(chiSquareSurvival(statistic, degrees)).toBeCloseTo(0.05, 12);
    },
  );

  it.each([0.0001, 0.1, 1, 10, 100])(
    'matches the exact two-degree exponential tail at %s',
    (value) => {
      expect(chiSquareSurvival(value, 2)).toBeCloseTo(Math.exp(-value / 2), 13);
    },
  );

  it.each([1, 4, 32, 128, 384])(
    'stays bounded and decreases with the statistic for %i degrees',
    (degrees) => {
      const values = [
        0,
        0.01,
        degrees / 2,
        degrees,
        degrees * 2,
        degrees * 10,
      ].map((value) => chiSquareSurvival(value, degrees));
      expect(values[0]).toBe(1);
      for (let index = 1; index < values.length; index++) {
        expect(values[index]).toBeGreaterThanOrEqual(0);
        expect(values[index]).toBeLessThanOrEqual(values[index - 1]!);
      }
      expect(chiSquareSurvival(Infinity, degrees)).toBe(0);
    },
  );

  it.each([
    [-1, 1],
    [NaN, 1],
    [1, 0],
    [1, 385],
    [1, 1.5],
  ])('rejects invalid inputs', (statistic, degrees) => {
    expect(() => chiSquareSurvival(statistic, degrees)).toThrow(RangeError);
  });
});
