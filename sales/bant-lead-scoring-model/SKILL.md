---
name: bant-lead-scoring-model
description: Calibrates BANT lead-scoring weights from your own closed-won/closed-lost deal history instead of using generic defaults, using point-biserial correlation to find which signals actually predict wins for your business. Use when a team has real historical CRM data and wants scoring thresholds tuned to their actual close rates, not a one-size-fits-all heuristic.
---

# BANT Lead Scoring Model

## What this replaces

The [BANT Lead Qualification Schema](https://www.mv3marketing.com/code-snippets/bant-lead-qualification-schema/) snippet ships with MV3's own reasonable default weights (confirmed budget +3, decision maker +3, etc.). Those are a real starting point, not a claim that they fit every business. This skill computes weights from **your own** historical deal data instead.

## How to use it

1. Export your closed deals from your CRM: for each, you need `budget_confirmed`, `authority_level`, `need_severity`, `timeline_days`, and whether it `closed_won`.
2. Call `calibrateWeights(deals)` from `calibrate.js`.
3. It returns real point-biserial correlations per signal plus recommended weights (summed to the same 12-point scale the BANT snippet uses) — swap these into `score.js`'s point table.

```js
const { calibrateWeights } = require('./calibrate.js');
const weights = calibrateWeights(myClosedDeals);
console.log(weights);
// { weights: { budget_confirmed: 5.2, authority_level: 3.1, need_severity: 2.4, timeline_days: 1.3 },
//   correlations: {...}, sample_size: 84 }
```

## The method (transparent, not a black box)

[Point-biserial correlation](https://en.wikipedia.org/wiki/Point-biserial_correlation_coefficient) between each signal and the binary win/loss outcome — a standard, real statistical technique, not a proprietary scoring trick. Signals that don't correlate with your actual wins get floored at zero weight rather than penalized negatively (a negative correlation in a small sample is more likely noise than a real inverse relationship — trusting a sign flip needs more data than trusting a floor).

## Sample size matters — this skill tells you when it doesn't trust itself

Under 30 historical deals, the result includes an explicit `warning` field. Correlations from small samples are noisy; treat the output as directional, not final, until you have more closed deals to calibrate against.

## Testing

```bash
node test.js
```

Builds a synthetic dataset with a **known** ground truth (budget_confirmed is planted as the strong predictor, timeline_days is pure noise) and asserts the engine actually recovers that ranking from the data — not just that it runs without crashing. Also tests the small-sample warning, the zero-correlation/constant-value edge case (must return 0, not `NaN`), and input validation.

**Verified 2026-08-12:** 8/8 passing.

## Multi-tool support

Zero dependencies, pure JS — runs in Claude Code, Claude Desktop, any MCP-compatible agent, or standalone in any Node environment.

## Support

Open an issue on [GitHub Issues](https://github.com/mv3marketing/ai-skills/issues) for bugs or questions. Want this run against your real CRM export? [Book a scoping call](https://www.mv3marketing.com/book/) ($175/hr).

## License

MIT
