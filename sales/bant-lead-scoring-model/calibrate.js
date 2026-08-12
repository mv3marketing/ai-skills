/**
 * BANT Lead Scoring Model — calibration engine.
 *
 * The BANT Lead Qualification Schema snippet ships with MV3's own default
 * point weights (budget +3, decision_maker +3, etc.) — reasonable defaults,
 * but not YOUR data. This skill computes real, data-driven weights from your
 * own closed-won/closed-lost history, so "hot" actually correlates with deals
 * that close for your specific business instead of a generic heuristic.
 *
 * Method: point-biserial correlation between each signal and the binary
 * closed_won outcome, then normalized so total weight budget matches the
 * snippet's 12-point scale — a drop-in replacement for score.js's weights.
 */

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function pointBiserial(values, outcomes) {
  // Standard point-biserial correlation: correlate a continuous/ordinal
  // variable against a binary outcome.
  const won = values.filter((_, i) => outcomes[i]);
  const lost = values.filter((_, i) => !outcomes[i]);
  if (won.length === 0 || lost.length === 0) return 0;
  const m1 = mean(won), m0 = mean(lost);
  const allMean = mean(values);
  const sd = Math.sqrt(mean(values.map(v => (v - allMean) ** 2)));
  if (sd === 0) return 0;
  const p = won.length / values.length;
  const q = 1 - p;
  return ((m1 - m0) / sd) * Math.sqrt(p * q);
}

/**
 * @param {Array<{budget_confirmed:boolean, authority_level:string, need_severity:number, timeline_days:number, closed_won:boolean}>} deals
 * @returns {{weights: object, correlations: object, sample_size: number, warning?: string}}
 */
function calibrateWeights(deals) {
  if (!Array.isArray(deals) || deals.length === 0) {
    throw new TypeError('calibrateWeights requires a non-empty array of historical deals');
  }
  const outcomes = deals.map(d => !!d.closed_won);

  const budgetVals = deals.map(d => d.budget_confirmed ? 1 : 0);
  const authorityVals = deals.map(d => d.authority_level === 'decision_maker' ? 2 : d.authority_level === 'influencer' ? 1 : 0);
  const needVals = deals.map(d => d.need_severity);
  // Timeline: invert so "sooner" is a higher number, consistent direction with the others.
  const maxTimeline = Math.max(...deals.map(d => d.timeline_days), 1);
  const timelineVals = deals.map(d => maxTimeline - d.timeline_days);

  const correlations = {
    budget_confirmed: pointBiserial(budgetVals, outcomes),
    authority_level: pointBiserial(authorityVals, outcomes),
    need_severity: pointBiserial(needVals, outcomes),
    timeline_days: pointBiserial(timelineVals, outcomes),
  };

  // Weight each signal proportional to |correlation|, floor at 0 (a
  // negative correlation means "don't use this signal to predict wins" —
  // clamped rather than inverted, since inverting would need more data to
  // trust the sign flip than a floor does).
  const abs = Object.fromEntries(Object.entries(correlations).map(([k, v]) => [k, Math.max(v, 0)]));
  const total = Object.values(abs).reduce((a, b) => a + b, 0);

  const weights = {};
  if (total === 0) {
    // No signal correlates with outcome in this dataset — fall back to
    // MV3's defaults rather than dividing by zero or returning all-zero weights.
    weights.budget_confirmed = 3; weights.authority_level = 3; weights.need_severity = 3; weights.timeline_days = 3;
  } else {
    for (const k of Object.keys(abs)) {
      weights[k] = Math.round((abs[k] / total) * 12 * 10) / 10; // 1 decimal place, budget sums to ~12
    }
  }

  const result = { weights, correlations, sample_size: deals.length };
  if (deals.length < 30) {
    result.warning = `Only ${deals.length} historical deals provided — correlations from samples this small are noisy. Treat these weights as directional, not final, until you have 30+ closed deals.`;
  }
  return result;
}

module.exports = { calibrateWeights, pointBiserial };
