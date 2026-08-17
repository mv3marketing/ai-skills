---
name: churn-risk-cohort-survival-analyzer
description: Computes real customer retention curves using the Kaplan-Meier product-limit estimator, correctly accounting for customers who haven't churned yet (censored observations) instead of dropping them or wrongly counting them as permanently retained. Compares retention across cohorts (plan tier, signup month, segment) and reports median survival time. Use for churn/retention analysis, not individual-customer risk scoring.
---

# Churn Risk Cohort Survival Analyzer

A real survival-analysis engine, not a health-score model. A health score (see the
separate `health-score-weight-calibrator` skill) predicts an individual customer's risk
today. This answers a different, cohort-level question: what fraction of customers like
this one are still active after N days, computed the statistically correct way.

## What this is (and isn't)

Pure functions over the customer tenure data you supply. Not a live CRM integration and
not a hosted analytics dashboard.

## Files

| File | Purpose |
|---|---|
| `survival.js` | `computeKaplanMeierCurve()`, `computeMedianSurvivalTime()`, `compareCohortSurvival()` — zero dependencies |
| `test.js` | 14-test suite, hand-verified against the classic Kaplan-Meier worked example |

## How to use it

```js
const { computeKaplanMeierCurve, computeMedianSurvivalTime, compareCohortSurvival } = require('./survival.js');

const curve = computeKaplanMeierCurve([
  { customerId: 'c1', tenureDays: 45, churned: true },
  { customerId: 'c2', tenureDays: 90, churned: false }, // still active -- correctly censored, not dropped
  { customerId: 'c3', tenureDays: 60, churned: true },
]);
// curve -> [{ tenureDays, atRisk, events, survivalProbability }, ...]

computeMedianSurvivalTime(curve); // first tenure day survival drops to <= 50%, or null

// Compare retention across segments
const byCohort = compareCohortSurvival(customersWithCohortField);
// byCohort.enterprise.medianSurvivalTime vs byCohort.smb.medianSurvivalTime
```

## The two real guardrails

1. **Correct handling of censored customers** — a customer who hasn't churned yet is
   still "at risk" up through their current tenure, but is never wrongly counted as an
   "event." Dropping active customers from the analysis (a common naive mistake)
   understates retention; counting them as permanently safe overstates it. The
   Kaplan-Meier product-limit estimator handles both correctly.
2. **Honest median reporting** — `computeMedianSurvivalTime()` returns `null`, not an
   extrapolated guess, when the observed data never shows survival dropping to 50%. Many
   real retention curves never reach that point within the observation window, and this
   says so rather than inventing a number.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real subscription/billing platform's actual tenure and churn data.
