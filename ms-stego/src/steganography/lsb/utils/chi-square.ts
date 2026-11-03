const EPSILON = 1e-14;
const MIN_DENOMINATOR = 1e-300;
const MAX_ITERATIONS = 10000;

function logGammaShape(degrees: number): number {
  const shape = degrees / 2;
  let value = degrees % 2 === 0 ? 0 : Math.log(Math.PI) / 2;
  for (let term = degrees % 2 === 0 ? 1 : 0.5; term < shape; term++)
    value += Math.log(term);
  return value;
}

function nonzero(value: number): number {
  return Math.abs(value) >= MIN_DENOMINATOR
    ? value
    : value < 0
      ? -MIN_DENOMINATOR
      : MIN_DENOMINATOR;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value))
    throw new RangeError('The chi-square calculation did not converge');
  return Math.max(0, Math.min(1, value));
}

export function chiSquareSurvival(statistic: number, degrees: number): number {
  if (
    !Number.isInteger(degrees) ||
    degrees < 1 ||
    degrees > 384 ||
    Number.isNaN(statistic) ||
    statistic < 0
  ) {
    throw new RangeError('Invalid chi-square parameters');
  }
  if (statistic === 0) return 1;
  if (statistic === Infinity) return 0;
  const shape = degrees / 2;
  const x = statistic / 2;
  const logScale = shape * Math.log(x) - x - logGammaShape(degrees);
  if (x < shape + 1) {
    let term = 1 / shape;
    let sum = term;
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      term *= x / (shape + iteration);
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * EPSILON) {
        return clampProbability(-Math.expm1(logScale + Math.log(sum)));
      }
    }
  } else {
    let denominator = x + 1 - shape;
    let c = 1 / MIN_DENOMINATOR;
    let d = 1 / denominator;
    let fraction = d;
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      const numerator = -iteration * (iteration - shape);
      denominator += 2;
      d = 1 / nonzero(numerator * d + denominator);
      c = nonzero(denominator + numerator / c);
      const step = d * c;
      fraction *= step;
      if (Math.abs(step - 1) <= EPSILON) {
        return clampProbability(Math.exp(logScale + Math.log(fraction)));
      }
    }
  }
  throw new RangeError('The chi-square calculation did not converge');
}
