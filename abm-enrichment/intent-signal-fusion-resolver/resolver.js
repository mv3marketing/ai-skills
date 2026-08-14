/**
 * Multi-Source Intent Signal Fusion & Conflict Resolver
 * MV3 Marketing — ABM / Intent / Enrichment skill
 *
 * Fuses intent signals from 2+ sources (6sense, ZoomInfo, Clay, etc.) into
 * one composite per-topic score with recency decay and a noisy-OR
 * combination rule, instead of naive summation — which double-counts when
 * multiple vendors report the same real-world surge.
 */

'use strict';

const MS_PER_DAY = 86400000;

/**
 * Applies exponential recency decay to a raw signal strength.
 * @param {number} strength - 0-1 raw signal strength
 * @param {number} ageDays - how many days old the signal is
 * @param {number} halfLifeDays - days at which strength has decayed to half
 */
function decayedStrength(strength, ageDays, halfLifeDays) {
  const lambda = Math.LN2 / halfLifeDays;
  return strength * Math.exp(-lambda * ageDays);
}

/**
 * Fuses signals into one composite intent score per topic, using a
 * noisy-OR combination: combined = 1 - product(1 - s_i) across sources for
 * that topic. This correctly models "probability at least one source
 * detected real intent" and is bounded in [0,1] — naive summation is not,
 * and double-counts when multiple vendors flag the same real surge.
 *
 * @param {Array<{source: string, topic: string, strength: number, timestampISO: string}>} signals
 * @param {string} asOfISO - the reference date to compute recency decay against
 * @param {Object} [opts]
 * @param {number} [opts.halfLifeDays=14]
 * @returns {Array<{topic: string, compositeScore: number, sourceCount: number, contributingSources: string[]}>} sorted by compositeScore desc
 */
function fuseIntentSignals(signals, asOfISO, opts = {}) {
  if (!Array.isArray(signals)) throw new Error('signals must be an array.');
  const asOf = new Date(asOfISO);
  if (Number.isNaN(asOf.getTime())) throw new Error('asOfISO must be a valid date string.');

  const { halfLifeDays = 14 } = opts;
  if (halfLifeDays <= 0) throw new Error('halfLifeDays must be > 0.');

  const byTopic = new Map();

  for (const s of signals) {
    if (typeof s.strength !== 'number' || s.strength < 0 || s.strength > 1) {
      throw new Error(`Signal from "${s.source}" has invalid strength "${s.strength}" (must be 0-1).`);
    }
    if (!s.topic) throw new Error('Every signal needs a topic.');
    if (!s.source) throw new Error('Every signal needs a source.');
    const ts = new Date(s.timestampISO);
    if (Number.isNaN(ts.getTime())) throw new Error(`Signal from "${s.source}" has an invalid timestampISO.`);

    const ageDays = (asOf.getTime() - ts.getTime()) / MS_PER_DAY;
    if (ageDays < 0) throw new Error(`Signal from "${s.source}" is timestamped after asOfISO.`);

    const decayed = decayedStrength(s.strength, ageDays, halfLifeDays);

    if (!byTopic.has(s.topic)) byTopic.set(s.topic, []);
    byTopic.get(s.topic).push({ source: s.source, decayed });
  }

  const results = [];
  for (const [topic, entries] of byTopic.entries()) {
    // Noisy-OR across all contributing signals for this topic (including
    // multiple signals from the same source over time - each is real
    // independent evidence unless the caller has already deduped).
    let productOfMisses = 1;
    for (const e of entries) {
      productOfMisses *= (1 - e.decayed);
    }
    const compositeScore = Number((1 - productOfMisses).toFixed(4));
    const contributingSources = [...new Set(entries.map((e) => e.source))];

    results.push({ topic, compositeScore, sourceCount: contributingSources.length, contributingSources });
  }

  results.sort((a, b) => b.compositeScore - a.compositeScore);
  return results;
}

module.exports = { fuseIntentSignals, decayedStrength };
