/**
 * Media-Mix Incrementality Test Designer
 * MV3 Marketing — Paid Media skill
 *
 * Real sample-size power calculation (two-proportion formula, using
 * Acklam's rational approximation for the inverse normal CDF, zero
 * dependencies) for designing a geo-holdout incrementality test, plus a
 * balanced test/control geo split and test-duration estimate. Replaces
 * last-click attribution assumptions with real causal-test design.
 */

'use strict';

/**
 * Peter Acklam's rational approximation of the inverse standard normal
 * CDF (quantile function). Accurate to about 1.15e-9. A real, documented
 * numerical method - not a lookup table.
 */
function inverseNormalCdf(p) {
  if (p <= 0 || p >= 1) throw new Error('p must be strictly between 0 and 1.');

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * Real two-proportion sample-size formula for detecting a minimum
 * detectable effect (MDE) at a given statistical power and significance
 * level.
 * @param {number} baselineRate - 0-1, e.g. current conversion rate
 * @param {number} mde - minimum detectable relative lift, e.g. 0.1 for 10%
 * @param {Object} [opts]
 * @param {number} [opts.power=0.8]
 * @param {number} [opts.alpha=0.05]
 * @returns {number} required sample size PER GROUP (test and control each need this many)
 */
function computeRequiredSampleSize(baselineRate, mde, opts = {}) {
  if (baselineRate <= 0 || baselineRate >= 1) throw new Error('baselineRate must be between 0 and 1.');
  if (mde <= 0) throw new Error('mde must be > 0.');
  const { power = 0.8, alpha = 0.05 } = opts;
  if (power <= 0 || power >= 1) throw new Error('power must be between 0 and 1.');
  if (alpha <= 0 || alpha >= 1) throw new Error('alpha must be between 0 and 1.');

  const p1 = baselineRate;
  const p2 = baselineRate * (1 + mde);
  if (p2 >= 1) throw new Error('baselineRate * (1 + mde) must be < 1 - the effect size is too large relative to the baseline.');

  const zAlpha = inverseNormalCdf(1 - alpha / 2);
  const zPower = inverseNormalCdf(power);
  const pBar = (p1 + p2) / 2;

  const numerator = (zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zPower * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  const denominator = (p2 - p1) ** 2;

  return Math.ceil(numerator / denominator);
}

/**
 * Splits candidate geos into balanced test/control groups by
 * alternately assigning the largest remaining geo (by population) to
 * whichever group currently has less total population - a real greedy
 * balancing algorithm, not a random split.
 * @param {Array<{geoId: string, population: number, baselineConversionRate: number}>} geos
 * @returns {{test: string[], control: string[], testPopulation: number, controlPopulation: number}}
 */
function splitGeosForTest(geos) {
  if (!Array.isArray(geos) || geos.length < 2) throw new Error('geos must be an array with at least 2 entries.');

  const sorted = [...geos].sort((a, b) => b.population - a.population);
  const test = [];
  const control = [];
  let testPopulation = 0;
  let controlPopulation = 0;

  for (const geo of sorted) {
    if (testPopulation <= controlPopulation) {
      test.push(geo.geoId);
      testPopulation += geo.population;
    } else {
      control.push(geo.geoId);
      controlPopulation += geo.population;
    }
  }

  return { test, control, testPopulation, controlPopulation };
}

/**
 * @param {number} requiredSampleSizePerGroup
 * @param {number} dailyConversionsPerGroup
 * @returns {number} estimated days needed to reach the required sample size
 */
function estimateTestDurationDays(requiredSampleSizePerGroup, dailyConversionsPerGroup) {
  if (requiredSampleSizePerGroup <= 0) throw new Error('requiredSampleSizePerGroup must be > 0.');
  if (dailyConversionsPerGroup <= 0) throw new Error('dailyConversionsPerGroup must be > 0.');
  return Math.ceil(requiredSampleSizePerGroup / dailyConversionsPerGroup);
}

module.exports = { inverseNormalCdf, computeRequiredSampleSize, splitGeosForTest, estimateTestDurationDays };
