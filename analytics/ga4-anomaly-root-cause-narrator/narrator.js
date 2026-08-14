/**
 * GA4 Anomaly Root-Cause Narrator
 * MV3 Marketing — Analytics / Attribution skill
 *
 * Cross-references a GA4 metric anomaly against GSC ranking-change events,
 * GTM tag-publish events, and ad-platform spend-change events, ranking
 * candidate causes by timing proximity and category prior — instead of a
 * dashboard that just says "traffic dropped."
 *
 * The single most common false alarm this targets: "tracking broke" vs.
 * "real demand shift" — the two categories are surfaced explicitly.
 */

'use strict';

// Category priors reflect how deterministically each event type tends to
// explain an anomaly of a given metric type. Not a trained model — a
// documented, editable starting prior, stated honestly as such.
const CATEGORY_PRIORS = {
  gtm_publish: { category: 'tracking', prior: 0.85 },
  tag_error: { category: 'tracking', prior: 0.9 },
  gsc_ranking_change: { category: 'demand', prior: 0.6 },
  ad_spend_change: { category: 'demand', prior: 0.65 },
  site_change: { category: 'tracking', prior: 0.55 },
  seasonal: { category: 'demand', prior: 0.4 },
};

const MS_PER_DAY = 86400000;

function daysBetween(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / MS_PER_DAY;
}

/**
 * @param {string} anomalyDateISO - date the anomaly was observed
 * @param {Array<{type: string, date: string, description: string}>} events - candidate causal events
 * @param {Object} [opts]
 * @param {number} [opts.proximityHalfLifeDays=2] - days at which proximity confidence has decayed to half
 * @returns {{ranked: Array<{type, date, description, category, confidence}>, topCategory: string|null}}
 */
function narrateAnomaly(anomalyDateISO, events, opts = {}) {
  if (!anomalyDateISO || Number.isNaN(new Date(anomalyDateISO).getTime())) {
    throw new Error('anomalyDateISO must be a valid date string.');
  }
  if (!Array.isArray(events)) {
    throw new Error('events must be an array.');
  }

  const { proximityHalfLifeDays = 2 } = opts;
  if (proximityHalfLifeDays <= 0) throw new Error('proximityHalfLifeDays must be > 0.');

  const decayLambda = Math.LN2 / proximityHalfLifeDays;

  const ranked = events.map((e) => {
    if (!e.type || !CATEGORY_PRIORS[e.type]) {
      throw new Error(`Unknown event type "${e.type}". Known types: ${Object.keys(CATEGORY_PRIORS).join(', ')}`);
    }
    if (!e.date || Number.isNaN(new Date(e.date).getTime())) {
      throw new Error(`Event "${e.type}" has an invalid date.`);
    }
    const { category, prior } = CATEGORY_PRIORS[e.type];
    const days = daysBetween(anomalyDateISO, e.date);
    const proximityWeight = Math.exp(-decayLambda * days); // 1.0 at 0 days, 0.5 at the half-life
    const confidence = Number((prior * proximityWeight).toFixed(4));

    return { type: e.type, date: e.date, description: e.description || '', category, daysFromAnomaly: Number(days.toFixed(2)), confidence };
  });

  ranked.sort((a, b) => b.confidence - a.confidence);

  const topCategory = ranked.length > 0 ? ranked[0].category : null;

  return { ranked, topCategory };
}

module.exports = { narrateAnomaly, CATEGORY_PRIORS };
