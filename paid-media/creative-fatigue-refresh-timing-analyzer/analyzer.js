/**
 * Creative Fatigue & Refresh-Timing Analyzer
 * MV3 Marketing — Paid Media skill
 *
 * Fits an exponential decay curve to CTR vs. days-live, and projects the
 * specific date CTR will cross a fatigue threshold — instead of a static
 * "-X% drop" rule that fires after the damage is already done.
 */

'use strict';

/**
 * Fits CTR(t) = ctr0 * exp(-k * t) via log-linear least-squares regression.
 * ln(CTR) = ln(ctr0) - k*t is linear in t, so a standard OLS fit on
 * (t, ln(CTR)) recovers ctr0 and k directly, with zero dependencies.
 *
 * @param {Array<{daysLive: number, ctr: number}>} history - CTR must be > 0 for every point (0% CTR days should be excluded upstream; a true zero has no defined log-decay rate)
 * @returns {{ctr0: number, k: number, rSquared: number}}
 */
function fitDecayCurve(history) {
  if (!Array.isArray(history) || history.length < 3) {
    throw new Error('fitDecayCurve requires at least 3 data points to fit a curve.');
  }
  for (const p of history) {
    if (typeof p.daysLive !== 'number' || typeof p.ctr !== 'number') {
      throw new Error('Every history point needs numeric daysLive and ctr.');
    }
    if (p.ctr <= 0) {
      throw new Error('ctr must be > 0 for every point (log-decay is undefined at CTR=0). Exclude true-zero days upstream.');
    }
  }

  const n = history.length;
  const xs = history.map((p) => p.daysLive);
  const ys = history.map((p) => Math.log(p.ctr));

  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - xMean) * (ys[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }
  if (denominator === 0) {
    throw new Error('All daysLive values are identical; cannot fit a curve against a single x value.');
  }

  const slope = numerator / denominator; // = -k
  const intercept = yMean - slope * xMean; // = ln(ctr0)
  const k = -slope;
  const ctr0 = Math.exp(intercept);

  // R^2 against the fitted log-linear model
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i];
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { ctr0: Number(ctr0.toFixed(6)), k: Number(k.toFixed(6)), rSquared: Number(rSquared.toFixed(4)) };
}

/**
 * Given a fitted decay curve, projects the day (days-live) at which CTR
 * crosses below the given fatigue threshold, and converts that to a
 * calendar refresh-by date given a launch date.
 *
 * @param {{ctr0: number, k: number}} model
 * @param {number} fatigueThreshold - CTR value considered "fatigued" (e.g. 0.01 for 1%)
 * @param {string} launchDateISO - ISO date string the creative went live
 * @returns {{daysUntilFatigue: number|null, refreshByDate: string|null, alreadyFatigued: boolean}}
 */
function projectRefreshDate(model, fatigueThreshold, launchDateISO) {
  if (fatigueThreshold <= 0) throw new Error('fatigueThreshold must be > 0.');
  if (model.k <= 0) {
    // No real decay detected (flat or improving creative) - no fatigue projection possible
    return { daysUntilFatigue: null, refreshByDate: null, alreadyFatigued: false };
  }
  if (model.ctr0 <= fatigueThreshold) {
    return { daysUntilFatigue: 0, refreshByDate: launchDateISO, alreadyFatigued: true };
  }

  const daysUntilFatigue = Math.log(model.ctr0 / fatigueThreshold) / model.k;
  const launch = new Date(launchDateISO + 'T00:00:00Z');
  if (Number.isNaN(launch.getTime())) throw new Error('launchDateISO must be a valid ISO date string.');

  const refreshDate = new Date(launch.getTime() + Math.ceil(daysUntilFatigue) * 86400000);
  const refreshByDate = refreshDate.toISOString().slice(0, 10);

  return {
    daysUntilFatigue: Number(daysUntilFatigue.toFixed(1)),
    refreshByDate,
    alreadyFatigued: false,
  };
}

module.exports = { fitDecayCurve, projectRefreshDate };
