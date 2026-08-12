---
name: ai-sdr-objection-handler
description: Branching decision tree for handling live sales objections in an AI SDR conversation — routes price, timing, and authority objections to a tested response strategy, with explicit rules for when to stop responding and escalate to a human rep. Use when an AI SDR or sales agent needs to respond to a prospect pushback rather than a flat "respond professionally to objections" prompt.
---

# AI SDR Objection Handler

## What this replaces

Most AI SDR objection handling is a single flat instruction: "respond to objections professionally." That has no memory of what it already tried, no sense of when an objection is a real disqualifier versus a stalling tactic, and no rule for when it's out of its depth. This skill replaces that with a real decision tree loaded from `objection-tree.json` and routed through `router.js` — every objection type has a named response strategy and a hard, auditable rule for when to stop and hand off to a human.

## When to use this skill

Load this skill when an agent is mid-conversation with a prospect (chat, email reply, or call transcript turn) and the prospect has raised an objection to buying, scheduling, or continuing the sales process.

Do **not** use this for objections outside its three covered domains (price, timing, authority) — see "What's out of scope" below.

## How to use it

1. Classify the prospect's objection into one of the 6 branches in `objection-tree.json` (see the trigger_examples on each branch — these are illustrative phrasings, not an exact-match requirement; use judgment).
2. Call `routeObjection(branchKey, state)` from `router.js`, passing the running conversation state (`pushback_counts`, and `timeline_days` if a timing objection has surfaced a specific number).
3. If the result is `{action: 'respond', response_strategy: ...}`, use that strategy to write the reply — it's guidance for what to say, not a script to paste verbatim.
4. If the result is `{action: 'escalate', reason: ...}`, **stop responding and hand off** to the configured Slack channel (`config.handoff_channel`, default `#sales-alerts`) with the reason and full conversation context. Do not keep negotiating past an escalation trigger.

## The 6 branches

| Objection type | Branch key | Escalation rule |
|---|---|---|
| Discount ask | `price.discount_ask` | After 2nd pushback round |
| Competitor price comparison | `price.competitor_price` | After 2nd pushback round |
| Budget freeze | `price.budget_freeze` | After 2nd pushback round |
| "Not now" | `timing.not_now` | If timeline > 180 days |
| "Next quarter" | `timing.wrong_quarter` | If timeline > 180 days |
| Not the decision maker | `authority.not_decision_maker` | Immediately — no response attempt |

Full trigger examples and response strategy text for every branch are in `objection-tree.json` — read the actual `response_strategy` field per branch before responding; the table above is a routing map, not the content.

## What's out of scope

This skill does not cover: technical/product objections ("does it integrate with X"), legal/procurement objections (MSA redlines, security review), or objections after a contract is already in legal review. Those need a different skill or a human from turn one — don't force them through this tree.

## Configuration

`objection-tree.json`'s top-level `config` block:

```json
{
  "handoff_channel": "#sales-alerts",
  "max_price_pushback_rounds": 2,
  "escalate_on_authority_objection": true,
  "timing_escalation_threshold_days": 180
}
```

Edit these directly to match your own team's real tolerance — the numbers here (2 rounds, 180 days) are MV3's own defaults, not universal constants.

## Multi-tool support

The branching logic in `router.js` and `objection-tree.json` has zero platform dependencies — it runs identically in Claude Code, Claude Desktop, or any MCP-compatible agent runtime. Only the install/load step differs per platform.

## Testing

```bash
node test.js
```

Covers: immediate escalation on authority objections, round-based escalation on price objections (respond twice, escalate on the third), timeline-threshold escalation on timing objections, and a structural sanity check that the tree still has exactly 6 branches and 3 distinct escalation rule types.

**Verified 2026-08-12:** 9/9 passing.

## Skill vs. Agent vs. Persona

| Type | What it is | Use here as |
|---|---|---|
| Skill | Reusable instruction set loaded on demand | This objection-handling tree |
| Agent | An autonomous worker that uses skills + tools | The AI SDR that calls this skill mid-conversation |
| Persona | A named voice/identity applied on top of an agent | e.g. "Joe Thompson, Executive Sales Rep" |
