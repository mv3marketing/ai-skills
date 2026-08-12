# MV3 AI SDR Objection Handler

A branching decision skill that gives AI SDR agents a tested response tree for the objections that actually kill deals — price, timing, and authority — with clear escalation rules to a human rep.

Built and maintained by **Jordan Reeves**, ABM & Outbound Pipeline, MV3 Marketing. Part of the [MV3 AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/).

## What this is (and isn't)

This is a documentation + skill-definition repo, not a hosted service. Installing gives you the skill file and decision logic — MV3 doesn't run this on your behalf unless you separately request implementation help.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | The actual skill definition — load this into Claude Code/Desktop/an MCP agent |
| `objection-tree.json` | The 6-branch decision tree + escalation config, editable without touching code |
| `router.js` | Zero-dependency decision router that reads the tree and decides respond-vs-escalate |
| `test.js` | Automated test covering all 3 escalation rule types + a structural sanity check |

## Quick start

```bash
git clone https://github.com/mv3marketing/ai-skills.git
cd ai-skills/sales/ai-sdr-objection-handler
node test.js          # confirms the tree + router work before you load them
```

Then load `SKILL.md` into your agent runtime — see `SKILL.md`'s own "How to use it" section for the per-turn call pattern.

## Install

| Platform | Steps |
|---|---|
| Claude Code | Copy this directory into your project's `.claude/skills/` (or wherever your skill discovery path is) — `SKILL.md`'s frontmatter (`name`, `description`) is what makes it discoverable. |
| Claude Desktop | Same skill format, same file — Desktop's skill loading follows the same `SKILL.md` convention. |
| MCP / other agent | `objection-tree.json` + `router.js` have zero platform dependencies — wire `routeObjection()` into any tool-call loop that has access to conversation state. |

## Security & validation

Verified 2026-08-12, not copied from a template:
- `npm audit`: **0 vulnerabilities** (this skill has zero runtime dependencies — `router.js` uses only the Node/JS standard library)
- `node test.js`: **9/9 tests passing** (see `test.js` for exact cases — immediate escalation, round-based escalation, timeline-threshold escalation, and a structural check that the tree still matches its documented shape)
- No outbound network calls anywhere in `router.js` or `objection-tree.json` — the decision logic is pure, local computation. The Slack handoff (`config.handoff_channel`) is a label your own integration reads and acts on; this skill doesn't post to Slack itself.

## Calibrating to your own objections

`objection-tree.json`'s `trigger_examples` and `response_strategy` text reflect MV3's own experience — they're a real starting point, not a universal script. Before running this live, swap in your own top 5-10 recurring objections from real call transcripts and adjust `response_strategy` to match how your team actually talks.

## Related skills

- [Cold Email Sequence Generator](https://www.mv3marketing.com/ai-skills/cold-email-sequence-generator/)
- [BANT Lead Scoring Model](https://www.mv3marketing.com/ai-skills/bant-lead-scoring-model/) — pairs well: route only `hot`/`warm` tier leads through active objection handling
- [ICP & Persona Builder](https://www.mv3marketing.com/ai-skills/icp-persona-builder/)

## Want this wired into your CRM?

$175/hr, integration assistance — we'll connect this skill's escalation logic to your real Slack, CRM, or dialer, scoped before any work starts. [Book a scoping call](https://www.mv3marketing.com/book/).

## License

MIT
