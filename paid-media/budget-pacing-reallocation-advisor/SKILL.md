---
name: budget-pacing-reallocation-advisor
description: Recommends specific dollar budget moves with a real guardrail against learning-phase resets - caps any single change at a safe percentage AND holds entirely if the campaign changed within a cooldown window, since most ad platforms reset the learning phase on large or frequent budget changes. Use before reallocating budget between campaigns based on performance.
---

# Budget Pacing & Reallocation Advisor

Constrained-optimization judgment, not "shift budget to winners." A budget move that looks
correct on performance data alone can still tank a campaign if it triggers a learning-phase
reset. This skill enforces two real guardrails most naive reallocation logic ignores: a
maximum single-move percentage, and a cooldown window since the last change.

## What this is (and isn't)

A recommendation function over campaign data you supply, not a hosted service or a live
ad-platform integration that changes budgets for you.

## Files

| File | Purpose |
|---|---|
| `advisor.js` | `computePacingStatus()` and `recommendBudgetChange()` — zero dependencies |
| `test.js` | 16-test suite covering pacing detection, the cooldown guardrail, and change-percentage capping |

## How to use it

```js
const { recommendBudgetChange } = require('./advisor.js');

const result = recommendBudgetChange(
  { campaignId: 'search-brand', currentDailyBudget: 100, performanceScore: 1.5, daysSinceLastBudgetChange: 10 },
  { maxChangePercent: 0.2, learningPhaseCooldownDays: 7 }
);
// result.action -> 'hold' | 'increase' | 'decrease'
// result.recommendedDailyBudget, result.changePercent, result.reason
```

`performanceScore` is a normalized ratio: 1.0 = exactly on target (e.g. actual ROAS / target
ROAS, or target CPA / actual CPA), above 1.0 = beating target.

## The two real guardrails

1. **Cooldown window** — if the campaign's budget changed within the configured cooldown
   (default 7 days), the recommendation is always `hold`, regardless of how strong the
   performance signal is.
2. **Change-percentage cap** — even outside the cooldown, any single recommended move is
   capped (default 20%), since most platforms treat a larger jump as significant enough to
   reset the learning phase.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real ad-platform performance data and budget-management workflow.
