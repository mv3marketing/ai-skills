/**
 * Deliverability Pre-Flight Gate
 * MV3 Marketing — Sales Engagement / Outbound infrastructure skill
 *
 * Blocks (or approves) a planned outbound send BEFORE it goes out, based on
 * domain age, current sending-volume ramp stage, and the 2024 Google/Yahoo
 * bulk-sender rules — instead of finding out a domain got throttled after
 * the fact.
 *
 * This is sending-infrastructure territory, deliberately distinct from any
 * conversational ai-sdr-* skill: it never writes or sends a message, it only
 * decides whether a planned volume is safe to send.
 */

'use strict';

/**
 * Google/Yahoo 2024 bulk-sender baseline: domains must ramp volume gradually.
 * These are conservative, published-guidance-derived stage caps, not a
 * per-domain-reputation ML model — that distinction is stated honestly in
 * the README, this is a gate, not a full reputation engine.
 */
const RAMP_STAGES = [
  { maxDomainAgeDays: 14, dailyCap: 50 },
  { maxDomainAgeDays: 30, dailyCap: 200 },
  { maxDomainAgeDays: 60, dailyCap: 500 },
  { maxDomainAgeDays: 90, dailyCap: 1500 },
  { maxDomainAgeDays: Infinity, dailyCap: 5000 },
];

const MAX_SAFE_BOUNCE_RATE = 0.02; // 2%, above published bulk-sender thresholds
const MAX_SAFE_COMPLAINT_RATE = 0.003; // 0.3%, Google/Yahoo's published complaint-rate ceiling

/**
 * @param {Object} domain
 * @param {number} domain.ageDays - age of the sending domain in days
 * @param {boolean} domain.spf - SPF record present
 * @param {boolean} domain.dkim - DKIM record present
 * @param {boolean} domain.dmarc - DMARC record present (p=quarantine or p=reject, not p=none)
 * @param {Array<{date: string, sent: number, bounced: number, complaints: number}>} domain.recentDays - last N days of send history, most recent last
 * @param {number} plannedVolume - the volume this specific campaign intends to send today
 * @returns {{allow: boolean, reason: string, dailyCap: number, currentStage: Object, warnings: string[]}}
 */
function evaluateSend(domain, plannedVolume) {
  if (typeof plannedVolume !== 'number' || plannedVolume < 0) {
    throw new Error('plannedVolume must be a non-negative number.');
  }
  if (typeof domain?.ageDays !== 'number' || domain.ageDays < 0) {
    throw new Error('domain.ageDays must be a non-negative number.');
  }

  const warnings = [];

  // 1. Authentication gate — SPF/DKIM/DMARC are non-negotiable per 2024 bulk-sender rules
  if (!domain.spf || !domain.dkim || !domain.dmarc) {
    const missing = [!domain.spf && 'SPF', !domain.dkim && 'DKIM', !domain.dmarc && 'DMARC'].filter(Boolean).join(', ');
    return {
      allow: false,
      reason: `Missing required authentication: ${missing}. Google/Yahoo's 2024 bulk-sender rules require all three before any meaningful volume is safe.`,
      dailyCap: 0,
      currentStage: null,
      warnings,
    };
  }

  // 2. Ramp-stage cap based on domain age
  const stage = RAMP_STAGES.find((s) => domain.ageDays <= s.maxDomainAgeDays);

  // 3. Recent bounce/complaint-rate check — a young domain with a bad last few days
  //    should tighten further even if technically under its age-based cap.
  const recentDays = Array.isArray(domain.recentDays) ? domain.recentDays.slice(-7) : [];
  let recentBounceRate = 0;
  let recentComplaintRate = 0;
  if (recentDays.length > 0) {
    const totalSent = recentDays.reduce((sum, d) => sum + d.sent, 0);
    const totalBounced = recentDays.reduce((sum, d) => sum + d.bounced, 0);
    const totalComplaints = recentDays.reduce((sum, d) => sum + d.complaints, 0);
    if (totalSent > 0) {
      recentBounceRate = totalBounced / totalSent;
      recentComplaintRate = totalComplaints / totalSent;
    }
  }

  if (recentComplaintRate > MAX_SAFE_COMPLAINT_RATE) {
    return {
      allow: false,
      reason: `Recent complaint rate ${(recentComplaintRate * 100).toFixed(2)}% exceeds the ${(MAX_SAFE_COMPLAINT_RATE * 100).toFixed(1)}% safe ceiling. Sending more volume now risks provider-level throttling of the whole domain.`,
      dailyCap: 0,
      currentStage: stage,
      warnings,
    };
  }
  if (recentBounceRate > MAX_SAFE_BOUNCE_RATE) {
    return {
      allow: false,
      reason: `Recent bounce rate ${(recentBounceRate * 100).toFixed(2)}% exceeds the ${(MAX_SAFE_BOUNCE_RATE * 100).toFixed(1)}% safe ceiling. Clean the list before sending more volume.`,
      dailyCap: 0,
      currentStage: stage,
      warnings,
    };
  }

  let effectiveCap = stage.dailyCap;
  if (recentBounceRate > MAX_SAFE_BOUNCE_RATE * 0.5) {
    effectiveCap = Math.floor(effectiveCap * 0.5);
    warnings.push(`Bounce rate is elevated (${(recentBounceRate * 100).toFixed(2)}%); daily cap halved as a precaution even though it is under the hard ceiling.`);
  }

  // 4. Sum today's already-sent volume across other campaigns, if provided
  const today = recentDays[recentDays.length - 1];
  const alreadySentToday = today ? today.sent : 0;
  const remainingCapacity = Math.max(0, effectiveCap - alreadySentToday);

  if (plannedVolume > remainingCapacity) {
    return {
      allow: false,
      reason: `Planned volume ${plannedVolume} exceeds remaining safe capacity ${remainingCapacity} for today (cap ${effectiveCap}, already sent ${alreadySentToday}).`,
      dailyCap: effectiveCap,
      currentStage: stage,
      warnings,
    };
  }

  return {
    allow: true,
    reason: `Planned volume ${plannedVolume} is within remaining safe capacity ${remainingCapacity} for today.`,
    dailyCap: effectiveCap,
    currentStage: stage,
    warnings,
  };
}

module.exports = { evaluateSend, RAMP_STAGES, MAX_SAFE_BOUNCE_RATE, MAX_SAFE_COMPLAINT_RATE };
