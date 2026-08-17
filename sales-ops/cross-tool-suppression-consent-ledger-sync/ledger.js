/**
 * Cross-Tool Suppression & Consent Ledger Sync
 * MV3 Marketing — Sales Engagement skill
 *
 * One DNC/suppression source of truth, reconciled across multiple outbound
 * tools' exported suppression lists. Solves two real problems naive
 * list-merging gets wrong:
 *
 *   1. Identifier normalization — the same contact can appear as
 *      "User+Promo@Example.COM" in one tool and "user@example.com" in
 *      another, or "(555) 123-4567" vs "+15551234567". A literal-string
 *      merge treats these as different people and silently misses the
 *      overlap.
 *   2. Conflict resolution — when the same contact is suppressed in one
 *      tool but still active in another, "most restrictive wins" is the
 *      only defensible default (a contact who unsubscribed anywhere should
 *      not still be reachable anywhere), and different suppression reasons
 *      carry different real-world severity (a GDPR erasure request is not
 *      the same thing as a soft bounce).
 */

'use strict';

// Higher number = more severe / takes precedence when the same identifier
// has conflicting suppression reasons across tools.
const SUPPRESSION_PRECEDENCE = {
  gdpr_erasure: 4,
  complaint: 3,
  manual_dnc: 3,
  hard_bounce: 2,
  unsubscribe: 2,
  soft_bounce: 1,
};

/**
 * @param {string} value
 * @param {'email'|'phone'} type
 * @returns {string}
 */
function normalizeIdentifier(value, type) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('value must be a non-empty string.');

  if (type === 'email') {
    const trimmed = value.trim().toLowerCase();
    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) throw new Error(`Not a valid email: ${value}`);
    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);
    // Strip plus-addressing (user+tag@domain -> user@domain). Deliberately
    // does NOT strip dots the way Gmail treats them as insignificant --
    // that's a Gmail-specific quirk that would wrongly merge distinct
    // mailboxes on most other providers.
    const plusIndex = local.indexOf('+');
    const canonicalLocal = plusIndex >= 0 ? local.slice(0, plusIndex) : local;
    if (!canonicalLocal) throw new Error(`Not a valid email: ${value}`);
    return `${canonicalLocal}@${domain}`;
  }

  if (type === 'phone') {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    if (digits.length >= 8 && value.trim().startsWith('+')) return `+${digits}`;
    throw new Error(`Cannot safely normalize phone number "${value}": ambiguous length/format. Only 10-digit US numbers, 11-digit US numbers with a leading 1, or already-E.164 numbers with an explicit "+" are handled.`);
  }

  throw new Error(`Unknown identifier type: ${type}. Must be 'email' or 'phone'.`);
}

/**
 * Merges every source tool's suppression record for the SAME normalized
 * identifier into one canonical record: most-severe reason wins, earliest
 * timestamp is preserved as the true "since" date.
 * @param {Array<{source: string, reason: string, suppressedAt: string}>} records
 * @returns {{suppressed: true, reason: string, since: string, sources: string[], requiresErasureReview: boolean}}
 */
function mergeSuppressionRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('records must be a non-empty array.');
  }
  for (const r of records) {
    if (!SUPPRESSION_PRECEDENCE.hasOwnProperty(r.reason)) {
      throw new Error(`Unknown suppression reason: ${r.reason}`);
    }
  }

  let winner = records[0];
  for (const r of records.slice(1)) {
    const currentScore = SUPPRESSION_PRECEDENCE[winner.reason];
    const candidateScore = SUPPRESSION_PRECEDENCE[r.reason];
    if (candidateScore > currentScore) {
      winner = r;
    } else if (candidateScore === currentScore && new Date(r.suppressedAt) < new Date(winner.suppressedAt)) {
      winner = r;
    }
  }

  const earliest = records.reduce((min, r) => (new Date(r.suppressedAt) < new Date(min) ? r.suppressedAt : min), records[0].suppressedAt);
  const sources = [...new Set(records.map((r) => r.source))];

  return {
    suppressed: true,
    reason: winner.reason,
    since: earliest,
    sources,
    // GDPR erasure is a legal-deletion request, not just a "don't email"
    // preference -- flagged for human/legal review rather than silently
    // treated as equivalent to a routine unsubscribe. Not legal advice,
    // just a routing signal.
    requiresErasureReview: records.some((r) => r.reason === 'gdpr_erasure'),
  };
}

/**
 * Builds a canonical consent ledger from raw per-tool suppression exports.
 * @param {Object<string, Array<{identifier: string, type: 'email'|'phone', reason: string, suppressedAt: string}>>} toolExports
 * @returns {{ledger: Object<string, Object>, gaps: Array<{identifier: string, suppressedIn: string[], canonicalReason: string}>}}
 */
function buildConsentLedger(toolExports) {
  if (!toolExports || typeof toolExports !== 'object' || Array.isArray(toolExports)) {
    throw new Error('toolExports must be an object keyed by tool name.');
  }
  const toolNames = Object.keys(toolExports);
  if (toolNames.length === 0) throw new Error('toolExports must contain at least one tool.');

  const byIdentifier = new Map();

  for (const [toolName, entries] of Object.entries(toolExports)) {
    if (!Array.isArray(entries)) throw new Error(`toolExports.${toolName} must be an array.`);
    for (const entry of entries) {
      const normalized = normalizeIdentifier(entry.identifier, entry.type);
      const record = { source: toolName, reason: entry.reason, suppressedAt: entry.suppressedAt };
      if (!byIdentifier.has(normalized)) byIdentifier.set(normalized, []);
      byIdentifier.get(normalized).push(record);
    }
  }

  const ledger = {};
  const gaps = [];
  for (const [identifier, records] of byIdentifier.entries()) {
    const canonical = mergeSuppressionRecords(records);
    ledger[identifier] = canonical;

    // A gap is a compliance risk: the contact is suppressed somewhere but
    // NOT suppressed (i.e. still eligible for outreach) in at least one
    // other connected tool.
    const suppressedIn = new Set(records.map((r) => r.source));
    const missingFrom = toolNames.filter((t) => !suppressedIn.has(t));
    if (missingFrom.length > 0) {
      gaps.push({ identifier, suppressedIn: [...suppressedIn], missingFrom, canonicalReason: canonical.reason });
    }
  }

  return { ledger, gaps };
}

/**
 * Turns the ledger's gaps into a concrete per-tool action list: which
 * identifiers need to be pushed into which tool's suppression list to
 * reach parity.
 * @param {Array<{identifier: string, missingFrom: string[], canonicalReason: string}>} gaps
 * @returns {Object<string, Array<{identifier: string, reason: string}>>}
 */
function computeSyncPlan(gaps) {
  if (!Array.isArray(gaps)) throw new Error('gaps must be an array.');
  const plan = {};
  for (const gap of gaps) {
    for (const tool of gap.missingFrom) {
      if (!plan[tool]) plan[tool] = [];
      plan[tool].push({ identifier: gap.identifier, reason: gap.canonicalReason });
    }
  }
  return plan;
}

module.exports = {
  normalizeIdentifier,
  mergeSuppressionRecords,
  buildConsentLedger,
  computeSyncPlan,
  SUPPRESSION_PRECEDENCE,
};
