/**
 * RFM + Predictive Segment Designer
 * MV3 Marketing — Email / Automation skill
 *
 * Real quantile-binning RFM (Recency/Frequency/Monetary) scoring against
 * YOUR OWN customer distribution (not fixed thresholds that break the
 * moment your business's actual scale differs), plus a documented segment
 * rule layer, output as ready-to-import segment labels.
 */

'use strict';

/**
 * Assigns a 1-5 quintile score to every value in an array, based on that
 * array's own distribution (equal-frequency binning), not a fixed
 * threshold. higherIsBetter=false inverts the score (used for recency,
 * where a LOWER "days since last purchase" is the better outcome).
 * @param {number[]} values
 * @param {boolean} higherIsBetter
 * @returns {number[]} one score (1-5) per input value, same order
 */
function quintileScore(values, higherIsBetter) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('values must be a non-empty array.');
  const n = values.length;
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);

  const scores = new Array(n);
  for (let rank = 0; rank < n; rank++) {
    const quintile = Math.min(5, Math.floor((rank / n) * 5) + 1); // 1-5, equal-frequency
    const score = higherIsBetter ? quintile : 6 - quintile;
    scores[sorted[rank].i] = score;
  }
  return scores;
}

/**
 * @param {Array<{id: string, daysSinceLastPurchase: number, purchaseCount: number, totalSpend: number}>} customers
 * @returns {Array<{id: string, r: number, f: number, m: number, avgScore: number, segment: string}>}
 */
function scoreCustomers(customers) {
  if (!Array.isArray(customers) || customers.length < 5) {
    throw new Error('scoreCustomers requires at least 5 customers to compute a meaningful quintile distribution.');
  }
  for (const c of customers) {
    if (!c.id) throw new Error('Every customer needs an id.');
    if (typeof c.daysSinceLastPurchase !== 'number' || typeof c.purchaseCount !== 'number' || typeof c.totalSpend !== 'number') {
      throw new Error(`Customer ${c.id} is missing a numeric daysSinceLastPurchase/purchaseCount/totalSpend.`);
    }
  }

  const rScores = quintileScore(customers.map((c) => c.daysSinceLastPurchase), false); // fewer days = better = higherIsBetter false (inverted)
  const fScores = quintileScore(customers.map((c) => c.purchaseCount), true);
  const mScores = quintileScore(customers.map((c) => c.totalSpend), true);

  return customers.map((c, i) => {
    const r = rScores[i];
    const f = fScores[i];
    const m = mScores[i];
    const avgScore = (r + f + m) / 3;
    return { id: c.id, r, f, m, avgScore: Number(avgScore.toFixed(2)), segment: labelSegment(r, f, m, avgScore) };
  });
}

/**
 * MV3's own documented, simplified segment rule set - not a claimed
 * reproduction of any specific vendor's proprietary RFM taxonomy.
 */
function labelSegment(r, f, m, avgScore) {
  if (r >= 4 && avgScore >= 4) return 'Champions';
  if (r >= 4 && f <= 2) return 'New / Promising';
  if (r <= 2 && avgScore >= 3.5) return 'At Risk';
  if (r <= 2 && avgScore < 2.5) return 'Lost';
  return 'Core';
}

module.exports = { quintileScore, scoreCustomers, labelSegment };
