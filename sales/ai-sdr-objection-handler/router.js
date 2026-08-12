/**
 * AI SDR Objection Handler — decision router.
 *
 * Tracks objection state across a conversation and decides, per turn,
 * whether to respond or escalate to a human rep. Deterministic — same
 * conversation history always produces the same decision, so behavior
 * is auditable, not vibes-based.
 */
const tree = require('./objection-tree.json');

/**
 * @param {string} branchKey - e.g. "price.discount_ask"
 * @param {object} state - mutable conversation state: { pushback_counts: {branchKey: n}, timeline_days: number|null }
 * @returns {{action: 'respond'|'escalate', branch: string, response_strategy?: string, reason?: string}}
 */
function routeObjection(branchKey, state) {
  const branch = tree.branches[branchKey];
  if (!branch) {
    throw new Error(`Unknown objection branch: "${branchKey}". Known branches: ${Object.keys(tree.branches).join(', ')}`);
  }

  state.pushback_counts = state.pushback_counts || {};
  state.pushback_counts[branchKey] = (state.pushback_counts[branchKey] || 0) + 1;
  const count = state.pushback_counts[branchKey];

  // Immediate escalation (authority) — no response attempt at all.
  if (branch.escalate_immediately) {
    return { action: 'escalate', branch: branchKey, reason: 'immediate_escalation_rule', channel: tree.config.handoff_channel };
  }

  // Timing-based escalation.
  if (branch.escalate_if_timeline_days_gt !== undefined && state.timeline_days != null) {
    if (state.timeline_days > branch.escalate_if_timeline_days_gt) {
      return { action: 'escalate', branch: branchKey, reason: `timeline_days ${state.timeline_days} exceeds threshold ${branch.escalate_if_timeline_days_gt}`, channel: tree.config.handoff_channel };
    }
  }

  // Round-based escalation (price branches).
  if (branch.escalate_after_rounds !== undefined && count > branch.escalate_after_rounds) {
    return { action: 'escalate', branch: branchKey, reason: `pushback round ${count} exceeds max ${branch.escalate_after_rounds}`, channel: tree.config.handoff_channel };
  }

  return { action: 'respond', branch: branchKey, response_strategy: branch.response_strategy, round: count };
}

module.exports = { routeObjection, tree };
