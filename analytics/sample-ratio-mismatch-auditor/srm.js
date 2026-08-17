/**
 * Sample-Ratio-Mismatch (SRM) Auditor
 * MV3 Marketing — Analytics skill
 *
 * Checks whether an A/B test's ACTUAL traffic split matches its INTENDED
 * assignment ratio, using a real chi-square goodness-of-fit test. This is
 * a real, distinct problem from testing whether a metric moved (see the
 * separate ab-significance-validator skill): a test can show a "winning"
 * variant purely because broken randomization, a redirect bug, or a bot
 * filter skewed how many users landed in each arm -- not because the
 * variant is actually better. Checking the split itself, before trusting
 * any metric difference, is standard experimentation-platform practice.
 *
 * SRM detection conventionally uses a much stricter significance
 * threshold than a typical experiment result (this defaults to 0.001,
 * not the usual 0.05), because under correct random assignment a
 * meaningful ratio mismatch should almost never happen by chance -- so
 * even a small deviation is worth investigating, and a much stricter
 * threshold avoids false alarms on ordinary sampling noise.
 */

'use strict';

const DEFAULT_ALPHA = 0.001;

/**
 * Abramowitz-Stegun rational approximation of the error function,
 * accurate to about 1.5e-7 -- the same standard approximation method
 * used across this marketplace's other statistics skills.
 * @param {number} x
 * @returns {number}
 */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

/**
 * Standard normal CDF via erf.
 * @param {number} z
 * @returns {number}
 */
function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Pearson's chi-square goodness-of-fit statistic.
 * @param {number[]} observed
 * @param {number[]} expected
 * @returns {number}
 */
function computeChiSquareStatistic(observed, expected) {
  if (!Array.isArray(observed) || !Array.isArray(expected) || observed.length !== expected.length) {
    throw new Error('observed and expected must be arrays of the same length.');
  }
  if (observed.length === 0) throw new Error('observed/expected must not be empty.');
  if (expected.some((e) => e <= 0)) throw new Error('Every expected count must be positive.');

  return observed.reduce((sum, o, i) => sum + Math.pow(o - expected[i], 2) / expected[i], 0);
}

/**
 * Exact two-tailed p-value for a chi-square statistic with 1 degree of
 * freedom -- mathematically exact given the erf approximation above,
 * since a chi-square(1) variable is the square of a standard normal.
 * @param {number} chiSquare
 * @returns {number}
 */
function pValueChiSquareDf1(chiSquare) {
  if (chiSquare < 0) throw new Error('chiSquare must be non-negative.');
  return 2 * (1 - normalCdf(Math.sqrt(chiSquare)));
}

/**
 * Detects sample ratio mismatch between two test arms.
 * @param {number} observedA
 * @param {number} observedB
 * @param {Object} [opts]
 * @param {number} [opts.expectedRatioA=0.5] - intended share of traffic for arm A, e.g. 0.5 for a 50/50 split
 * @param {number} [opts.alpha=0.001] - significance threshold; deliberately stricter than a typical 0.05
 * @returns {{observedA: number, observedB: number, observedRatioA: number, expectedRatioA: number, chiSquare: number, pValue: number, isSRM: boolean}}
 */
function detectSRM(observedA, observedB, opts = {}) {
  if (typeof observedA !== 'number' || observedA < 0 || typeof observedB !== 'number' || observedB < 0) {
    throw new Error('observedA and observedB must be non-negative numbers.');
  }
  const total = observedA + observedB;
  if (total === 0) throw new Error('observedA + observedB must be greater than 0.');

  const { expectedRatioA = 0.5, alpha = DEFAULT_ALPHA } = opts;
  if (expectedRatioA <= 0 || expectedRatioA >= 1) throw new Error('expectedRatioA must be strictly between 0 and 1.');
  if (alpha <= 0 || alpha >= 1) throw new Error('alpha must be strictly between 0 and 1.');

  const expectedA = total * expectedRatioA;
  const expectedB = total * (1 - expectedRatioA);
  const chiSquare = computeChiSquareStatistic([observedA, observedB], [expectedA, expectedB]);
  const pValue = pValueChiSquareDf1(chiSquare);

  return {
    observedA,
    observedB,
    observedRatioA: Number((observedA / total).toFixed(4)),
    expectedRatioA,
    chiSquare: Number(chiSquare.toFixed(4)),
    pValue: Number(pValue.toFixed(6)),
    isSRM: pValue < alpha,
  };
}

/**
 * Extends detectSRM() to N arms (e.g. a multi-variant test), using the
 * general chi-square goodness-of-fit statistic. Does not compute an exact
 * p-value for df > 1 (that requires the regularized incomplete gamma
 * function, which this zero-dependency skill does not implement) -- it
 * honestly returns the statistic and degrees of freedom and leaves the
 * p-value null rather than approximating one, flagging that a proper
 * chi-square table or library is needed for df > 1.
 * @param {number[]} observedCounts
 * @param {number[]} expectedRatios - must sum to 1
 * @returns {{chiSquare: number, degreesOfFreedom: number, pValue: null, note: string}}
 */
function detectSRMMultiArm(observedCounts, expectedRatios) {
  if (!Array.isArray(observedCounts) || !Array.isArray(expectedRatios) || observedCounts.length !== expectedRatios.length) {
    throw new Error('observedCounts and expectedRatios must be arrays of the same length.');
  }
  if (observedCounts.length < 2) throw new Error('Need at least 2 arms.');
  const ratioSum = expectedRatios.reduce((s, r) => s + r, 0);
  if (Math.abs(ratioSum - 1) > 0.0001) throw new Error(`expectedRatios must sum to 1, got ${ratioSum}.`);

  const total = observedCounts.reduce((s, o) => s + o, 0);
  const expectedCounts = expectedRatios.map((r) => total * r);
  const chiSquare = computeChiSquareStatistic(observedCounts, expectedCounts);
  const degreesOfFreedom = observedCounts.length - 1;

  return {
    chiSquare: Number(chiSquare.toFixed(4)),
    degreesOfFreedom,
    pValue: degreesOfFreedom === 1 ? Number(pValueChiSquareDf1(chiSquare).toFixed(6)) : null,
    note:
      degreesOfFreedom === 1
        ? 'Exact p-value computed.'
        : 'Exact p-value requires the chi-square CDF for df > 1, not implemented in this zero-dependency skill. Compare chiSquare against a standard chi-square critical value table at the desired alpha and this many degrees of freedom.',
  };
}

module.exports = {
  erf,
  normalCdf,
  computeChiSquareStatistic,
  pValueChiSquareDf1,
  detectSRM,
  detectSRMMultiArm,
  DEFAULT_ALPHA,
};
