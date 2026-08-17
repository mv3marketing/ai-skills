/**
 * Account Reach & Frequency Saturation Modeler
 * MV3 Marketing — ABM & Enrichment skill
 *
 * Models effective reach across a target account's buying committee using
 * the standard diminishing-returns exposure curve from media-planning
 * theory (used in comScore/Nielsen-style effective reach modeling):
 * cumulative reach probability after n impressions = 1 - (1-p)^n, where p
 * is a per-impression attention probability. Two real problems this
 * solves:
 *
 *   1. Nobody observes p directly. This calibrates it FROM your own
 *      historical engagement data (observed engagement rate + average
 *      impressions per contact) rather than assuming an arbitrary
 *      constant -- a real inverse solve of the same reach formula.
 *   2. Reach across a multi-person buying committee is not the sum of
 *      individual reach probabilities (that would overcount and can
 *      exceed 100%). This combines per-contact reach probabilities with
 *      the correct probabilistic formula for "at least one person
 *      reached," under the standard independence assumption, stated
 *      explicitly rather than silently baked in.
 */

'use strict';

const DEFAULT_OVERSATURATION_THRESHOLD = 0.95;
const DEFAULT_UNDERREACH_THRESHOLD = 0.3;

/**
 * Solves for the per-impression attention probability p implied by
 * observed historical engagement data, by inverting the reach curve
 * formula: observedRate = 1 - (1-p)^avgImpressions.
 * @param {number} observedEngagementRate - between 0 (exclusive) and 1 (exclusive)
 * @param {number} avgImpressionsPerContact - must be > 0
 * @returns {number} p
 */
function calibrateAttentionProbability(observedEngagementRate, avgImpressionsPerContact) {
  if (typeof observedEngagementRate !== 'number' || observedEngagementRate <= 0 || observedEngagementRate >= 1) {
    throw new Error('observedEngagementRate must be strictly between 0 and 1.');
  }
  if (typeof avgImpressionsPerContact !== 'number' || avgImpressionsPerContact <= 0) {
    throw new Error('avgImpressionsPerContact must be a positive number.');
  }
  const p = 1 - Math.pow(1 - observedEngagementRate, 1 / avgImpressionsPerContact);
  return Number(p.toFixed(6));
}

/**
 * Cumulative probability a single contact has been reached at least once
 * after a given number of impressions.
 * @param {number} impressions - non-negative integer
 * @param {number} p - per-impression attention probability, 0 < p <= 1
 * @returns {number}
 */
function cumulativeReachProbability(impressions, p) {
  if (typeof impressions !== 'number' || impressions < 0) throw new Error('impressions must be a non-negative number.');
  if (typeof p !== 'number' || p <= 0 || p > 1) throw new Error('p must be between 0 (exclusive) and 1 (inclusive).');
  return Number((1 - Math.pow(1 - p, impressions)).toFixed(6));
}

/**
 * The marginal reach gain from exactly one more impression at the current
 * count -- the first difference of the reach curve, making diminishing
 * returns explicit rather than implicit.
 * @param {number} impressions
 * @param {number} p
 * @returns {number}
 */
function marginalReachGain(impressions, p) {
  if (typeof impressions !== 'number' || impressions < 0) throw new Error('impressions must be a non-negative number.');
  if (typeof p !== 'number' || p <= 0 || p > 1) throw new Error('p must be between 0 (exclusive) and 1 (inclusive).');
  return Number((p * Math.pow(1 - p, impressions)).toFixed(6));
}

/**
 * Models reach across an entire buying committee: per-contact reach
 * probabilities, saturation/under-reach classification per contact, and a
 * combined "at least one committee member reached" probability under the
 * standard independence assumption.
 * @param {Array<{contactId: string, role: string, impressions: number}>} contacts
 * @param {number} p
 * @param {Object} [opts]
 * @param {number} [opts.oversaturationThreshold=0.95]
 * @param {number} [opts.underreachThreshold=0.3]
 * @returns {{contacts: Array<Object>, combinedCommitteeReach: number, anyOversaturated: boolean, anyUnderreached: boolean}}
 */
function modelAccountReach(contacts, p, opts = {}) {
  if (!Array.isArray(contacts) || contacts.length === 0) throw new Error('contacts must be a non-empty array.');
  const { oversaturationThreshold = DEFAULT_OVERSATURATION_THRESHOLD, underreachThreshold = DEFAULT_UNDERREACH_THRESHOLD } = opts;

  let productOfMisses = 1;
  let anyOversaturated = false;
  let anyUnderreached = false;

  const scoredContacts = contacts.map((contact) => {
    if (!contact.contactId) throw new Error('Every contact must have a contactId.');
    const reachProbability = cumulativeReachProbability(contact.impressions, p);
    const marginalGain = marginalReachGain(contact.impressions, p);
    const isOversaturated = reachProbability >= oversaturationThreshold;
    const isUnderreached = reachProbability < underreachThreshold;
    if (isOversaturated) anyOversaturated = true;
    if (isUnderreached) anyUnderreached = true;

    productOfMisses *= 1 - reachProbability;

    return {
      contactId: contact.contactId,
      role: contact.role,
      impressions: contact.impressions,
      reachProbability,
      marginalGain,
      isOversaturated,
      isUnderreached,
    };
  });

  return {
    contacts: scoredContacts,
    combinedCommitteeReach: Number((1 - productOfMisses).toFixed(6)),
    anyOversaturated,
    anyUnderreached,
  };
}

module.exports = {
  calibrateAttentionProbability,
  cumulativeReachProbability,
  marginalReachGain,
  modelAccountReach,
  DEFAULT_OVERSATURATION_THRESHOLD,
  DEFAULT_UNDERREACH_THRESHOLD,
};
