/**
 * Winback Sequence Architect
 * MV3 Marketing — Email / Automation skill
 *
 * Decides WHEN to trigger a winback attempt (tiered by the customer's
 * historical engagement level, not one fixed inactivity threshold for
 * everyone), WHETHER it's currently safe to send given the sending
 * domain's real deliverability risk, and WHEN to suppress instead of
 * continuing to email a customer who never re-engages — reconciling
 * winback timing against real list-hygiene guardrails, not just
 * "write a winback email."
 */

'use strict';

const TIER_TRIGGER_DAYS = { high: 45, medium: 30, low: 15 };
const ATTEMPT_SPACING_DAYS = 15; // days between successive winback attempts
const MAX_ATTEMPTS = 3;
const SAFE_BOUNCE_RATE = 0.02;
const SAFE_COMPLAINT_RATE = 0.003;

/**
 * @param {Object} customer
 * @param {number} customer.daysSinceLastEngagement
 * @param {'high'|'medium'|'low'} customer.historicalEngagementTier
 * @param {number} customer.priorWinbackAttempts - how many winback emails already sent with no re-engagement
 * @param {number} [customer.daysSinceLastWinbackAttempt] - required if priorWinbackAttempts > 0
 * @param {Object} [domainRisk]
 * @param {number} [domainRisk.bounceRate]
 * @param {number} [domainRisk.complaintRate]
 * @returns {{action: 'too_early'|'send_attempt'|'suppress'|'hold_for_deliverability', attemptNumber: number|null, reason: string}}
 */
function planWinback(customer, domainRisk = {}) {
  if (!customer || typeof customer.daysSinceLastEngagement !== 'number') {
    throw new Error('customer.daysSinceLastEngagement is required and must be a number.');
  }
  if (!TIER_TRIGGER_DAYS[customer.historicalEngagementTier]) {
    throw new Error(`customer.historicalEngagementTier must be one of: ${Object.keys(TIER_TRIGGER_DAYS).join(', ')}`);
  }
  const priorAttempts = customer.priorWinbackAttempts ?? 0;
  if (priorAttempts < 0) throw new Error('priorWinbackAttempts cannot be negative.');
  if (priorAttempts > 0 && typeof customer.daysSinceLastWinbackAttempt !== 'number') {
    throw new Error('daysSinceLastWinbackAttempt is required when priorWinbackAttempts > 0.');
  }

  // 1. Suppression: real list-hygiene guardrail. After MAX_ATTEMPTS with no
  // re-engagement, continuing to email risks sender reputation for no
  // return - suppress rather than keep trying indefinitely.
  if (priorAttempts >= MAX_ATTEMPTS) {
    return {
      action: 'suppress',
      attemptNumber: null,
      reason: `${priorAttempts} winback attempts sent with no re-engagement, meeting the ${MAX_ATTEMPTS}-attempt suppression threshold. Continuing to email risks sender reputation for a customer unlikely to return.`,
    };
  }

  // 2. Has enough inactivity time passed for THIS tier to trigger the next attempt?
  const triggerThreshold = priorAttempts === 0
    ? TIER_TRIGGER_DAYS[customer.historicalEngagementTier]
    : TIER_TRIGGER_DAYS[customer.historicalEngagementTier] + priorAttempts * ATTEMPT_SPACING_DAYS;

  if (customer.daysSinceLastEngagement < triggerThreshold) {
    return {
      action: 'too_early',
      attemptNumber: null,
      reason: `${customer.daysSinceLastEngagement} days inactive is under the ${triggerThreshold}-day trigger for a "${customer.historicalEngagementTier}" engagement-tier customer. Wait before sending.`,
    };
  }

  if (priorAttempts > 0 && customer.daysSinceLastWinbackAttempt < ATTEMPT_SPACING_DAYS) {
    return {
      action: 'too_early',
      attemptNumber: null,
      reason: `Only ${customer.daysSinceLastWinbackAttempt} days since the last winback attempt; wait until ${ATTEMPT_SPACING_DAYS} days have passed before the next attempt.`,
    };
  }

  // 3. Deliverability gate: reuse real bounce/complaint safety thresholds -
  // don't send winback volume into an already-at-risk sending domain.
  const bounceRate = domainRisk.bounceRate;
  const complaintRate = domainRisk.complaintRate;
  if ((typeof bounceRate === 'number' && bounceRate > SAFE_BOUNCE_RATE) || (typeof complaintRate === 'number' && complaintRate > SAFE_COMPLAINT_RATE)) {
    return {
      action: 'hold_for_deliverability',
      attemptNumber: priorAttempts + 1,
      reason: `This customer is due for winback attempt ${priorAttempts + 1}, but the sending domain's current bounce/complaint rate exceeds safe thresholds. Hold winback sends until domain health recovers.`,
    };
  }

  return {
    action: 'send_attempt',
    attemptNumber: priorAttempts + 1,
    reason: `${customer.daysSinceLastEngagement} days inactive meets the ${triggerThreshold}-day trigger for a "${customer.historicalEngagementTier}" engagement-tier customer, and the sending domain is healthy. Send winback attempt ${priorAttempts + 1}.`,
  };
}

module.exports = { planWinback, TIER_TRIGGER_DAYS, ATTEMPT_SPACING_DAYS, MAX_ATTEMPTS, SAFE_BOUNCE_RATE, SAFE_COMPLAINT_RATE };
