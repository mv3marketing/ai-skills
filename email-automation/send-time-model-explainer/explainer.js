/**
 * Send-Time Model Explainer
 * MV3 Marketing — Email / Automation skill
 *
 * Builds a recency-weighted hour x weekday engagement histogram with a
 * minimum-sample-size guard, and recommends a specific send window with a
 * plain-English rationale — instead of a generic "Tuesday at 10am" rule
 * that ignores your list's actual behavior.
 */

'use strict';

const MS_PER_DAY = 86400000;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * @param {Array<{timestampISO: string, weight?: number}>} events - engagement events (opens/clicks), weight defaults to 1
 * @param {string} asOfISO - reference date for recency decay
 * @param {Object} [opts]
 * @param {number} [opts.halfLifeDays=30]
 * @param {number} [opts.minSampleSize=10] - a bin needs at least this many raw events to be trusted
 * @returns {{recommendedWindow: {dayOfWeek: string, hour: number}|null, confidence: 'high'|'low'|'insufficient_data', rationale: string, topBins: Array}}
 */
function explainSendTime(events, asOfISO, opts = {}) {
  if (!Array.isArray(events) || events.length === 0) throw new Error('events must be a non-empty array.');
  const asOf = new Date(asOfISO);
  if (Number.isNaN(asOf.getTime())) throw new Error('asOfISO must be a valid date string.');

  const { halfLifeDays = 30, minSampleSize = 10 } = opts;
  if (halfLifeDays <= 0) throw new Error('halfLifeDays must be > 0.');
  if (minSampleSize < 1) throw new Error('minSampleSize must be >= 1.');

  const lambda = Math.LN2 / halfLifeDays;
  // bins[dayOfWeek][hour] = { weightedScore, rawCount }
  const bins = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ weightedScore: 0, rawCount: 0 })));

  for (const e of events) {
    const ts = new Date(e.timestampISO);
    if (Number.isNaN(ts.getTime())) throw new Error('Every event needs a valid timestampISO.');
    const ageDays = (asOf.getTime() - ts.getTime()) / MS_PER_DAY;
    if (ageDays < 0) throw new Error('An event is timestamped after asOfISO.');
    const weight = e.weight ?? 1;
    const decayed = weight * Math.exp(-lambda * ageDays);

    const dow = ts.getUTCDay();
    const hour = ts.getUTCHours();
    bins[dow][hour].weightedScore += decayed;
    bins[dow][hour].rawCount += 1;
  }

  const flatBins = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      flatBins.push({ dayOfWeek: DAY_NAMES[dow], hour, ...bins[dow][hour] });
    }
  }
  flatBins.sort((a, b) => b.weightedScore - a.weightedScore);

  const topBins = flatBins.slice(0, 5).filter((b) => b.rawCount > 0);
  const bestTrusted = flatBins.find((b) => b.rawCount >= minSampleSize);

  if (!bestTrusted) {
    return {
      recommendedWindow: null,
      confidence: 'insufficient_data',
      rationale: `No single hour x weekday bin reached the minimum sample size of ${minSampleSize} events. Collect more engagement data before trusting a specific send-time recommendation, or lower minSampleSize if this segment is inherently small.`,
      topBins,
    };
  }

  const bestOverall = flatBins[0];
  const confidence = bestOverall.rawCount >= minSampleSize ? 'high' : 'low';
  const chosen = confidence === 'high' ? bestOverall : bestTrusted;

  const rationale = confidence === 'high'
    ? `${chosen.dayOfWeek} at ${chosen.hour}:00 shows the highest recency-weighted engagement (${chosen.rawCount} raw events, weighted score ${chosen.weightedScore.toFixed(2)}), with enough volume (>= ${minSampleSize} events) to trust the signal.`
    : `The single highest-scoring bin (${bestOverall.dayOfWeek} at ${bestOverall.hour}:00) had only ${bestOverall.rawCount} events, below the ${minSampleSize}-event trust threshold, so the highest-scoring bin that DOES meet the threshold is recommended instead: ${chosen.dayOfWeek} at ${chosen.hour}:00 (${chosen.rawCount} events, weighted score ${chosen.weightedScore.toFixed(2)}).`;

  return {
    recommendedWindow: { dayOfWeek: chosen.dayOfWeek, hour: chosen.hour },
    confidence,
    rationale,
    topBins,
  };
}

module.exports = { explainSendTime, DAY_NAMES };
