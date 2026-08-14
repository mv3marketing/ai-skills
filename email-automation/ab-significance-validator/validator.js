/**
 * A/B Significance Validator
 * MV3 Marketing — Email / Automation skill
 *
 * A real two-proportion z-test (Abramowitz-Stegun erf approximation for
 * the normal CDF, zero dependencies) that catches false-positive
 * "winners" on underpowered tests — the actual statistics most agencies
 * skip in favor of "variant B has a higher number."
 */

'use strict';

/**
 * Abramowitz-Stegun approximation of the error function, accurate to
 * ~1.5e-7. Standard, well-known numerical method.
 */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Real two-proportion z-test, pooled variance under H0 (proportions equal).
 * @param {number} nA - variant A sample size
 * @param {number} xA - variant A successes (e.g. conversions)
 * @param {number} nB - variant B sample size
 * @param {number} xB - variant B successes
 * @param {number} [alpha=0.05] - significance threshold (two-tailed)
 * @returns {{pA: number, pB: number, zStatistic: number, pValue: number, significant: boolean, confidenceIntervalOfDifference: [number, number], warning: string|null}}
 */
function twoProportionZTest(nA, xA, nB, xB, alpha = 0.05) {
  if (![nA, xA, nB, xB].every((v) => typeof v === 'number' && v >= 0)) {
    throw new Error('nA, xA, nB, xB must all be non-negative numbers.');
  }
  if (xA > nA || xB > nB) throw new Error('Successes cannot exceed sample size.');
  if (nA === 0 || nB === 0) throw new Error('Both variants need a sample size > 0.');
  if (alpha <= 0 || alpha >= 1) throw new Error('alpha must be between 0 and 1.');

  const pA = xA / nA;
  const pB = xB / nB;
  const pPooled = (xA + xB) / (nA + nB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));

  let zStatistic = 0;
  let pValue = 1;
  if (se > 0) {
    zStatistic = (pB - pA) / se;
    pValue = 2 * (1 - normalCdf(Math.abs(zStatistic)));
  }

  const significant = pValue < alpha;

  // 95%-style CI on the raw difference (unpooled SE, the standard approach for a CI)
  const seDiff = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const zCrit = 1.959963985; // z for 95% two-tailed
  const diff = pB - pA;
  const ci = [Number((diff - zCrit * seDiff).toFixed(4)), Number((diff + zCrit * seDiff).toFixed(4))];

  let warning = null;
  const MIN_RECOMMENDED_SAMPLE = 355; // rule-of-thumb floor below which even a "significant" p-value is fragile to noise for typical CTR-scale effect sizes
  if (nA < MIN_RECOMMENDED_SAMPLE || nB < MIN_RECOMMENDED_SAMPLE) {
    warning = `Sample size (nA=${nA}, nB=${nB}) is below the ${MIN_RECOMMENDED_SAMPLE}-per-variant rule-of-thumb floor. A "significant" result here is more likely to be noise than a real effect - collect more data before declaring a winner.`;
  }

  return {
    pA: Number(pA.toFixed(4)),
    pB: Number(pB.toFixed(4)),
    zStatistic: Number(zStatistic.toFixed(4)),
    pValue: Number(pValue.toFixed(6)),
    significant,
    confidenceIntervalOfDifference: ci,
    warning,
  };
}

module.exports = { twoProportionZTest, erf, normalCdf };
