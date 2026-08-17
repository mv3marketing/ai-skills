/**
 * Cross-Platform Audience Overlap Auditor
 * MV3 Marketing — Paid Media skill
 *
 * Finds an account bidding against itself: campaigns with real,
 * measurable audience-signal overlap (Jaccard similarity on audience
 * list/segment IDs) that are NOT deliberately exclusion-linked, whether
 * within one platform (PMax vs Search) or across platforms (Google/Meta/
 * LinkedIn sharing the same uploaded customer list).
 */

'use strict';

/**
 * Jaccard similarity between two audience-signal sets.
 */
function jaccardSimilarity(signalsA, signalsB) {
  const setA = new Set(signalsA);
  const setB = new Set(signalsB);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const s of setA) if (setB.has(s)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * @param {Array<{campaignId: string, platform: string, channel: string, audienceSignals: string[], excludesCampaignIds?: string[]}>} campaigns
 * @param {Object} [opts]
 * @param {number} [opts.similarityThreshold=0.3]
 * @returns {Array<{campaignA: string, campaignB: string, platformA: string, platformB: string, similarity: number}>}
 */
function findAudienceOverlaps(campaigns, opts = {}) {
  if (!Array.isArray(campaigns) || campaigns.length < 2) {
    throw new Error('campaigns must be an array with at least 2 entries.');
  }
  for (const c of campaigns) {
    if (!c.campaignId) throw new Error('Every campaign needs a campaignId.');
    if (!Array.isArray(c.audienceSignals)) throw new Error(`Campaign ${c.campaignId} needs an audienceSignals array.`);
  }

  const { similarityThreshold = 0.3 } = opts;
  if (similarityThreshold <= 0 || similarityThreshold > 1) throw new Error('similarityThreshold must be between 0 (exclusive) and 1.');

  const findings = [];
  for (let i = 0; i < campaigns.length; i++) {
    for (let j = i + 1; j < campaigns.length; j++) {
      const a = campaigns[i];
      const b = campaigns[j];

      // Skip pairs that have deliberately excluded each other - that's
      // intentional audience carve-out, not a bug.
      const aExcludesB = (a.excludesCampaignIds || []).includes(b.campaignId);
      const bExcludesA = (b.excludesCampaignIds || []).includes(a.campaignId);
      if (aExcludesB || bExcludesA) continue;

      const similarity = jaccardSimilarity(a.audienceSignals, b.audienceSignals);
      if (similarity >= similarityThreshold) {
        findings.push({
          campaignA: a.campaignId,
          campaignB: b.campaignId,
          platformA: a.platform,
          platformB: b.platform,
          similarity: Number(similarity.toFixed(3)),
        });
      }
    }
  }

  findings.sort((x, y) => y.similarity - x.similarity);
  return findings;
}

module.exports = { findAudienceOverlaps, jaccardSimilarity };
