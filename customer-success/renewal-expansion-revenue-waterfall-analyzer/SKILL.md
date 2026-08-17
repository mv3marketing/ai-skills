---
name: renewal-expansion-revenue-waterfall-analyzer
description: Builds a real ARR waterfall bridge (new/expansion/contraction/churn) from account-level previous vs current ARR, and computes Net Revenue Retention (NRR) and Gross Revenue Retention (GRR) using their correct, distinct SaaS metric definitions - NRR includes expansion and excludes new logos, GRR excludes expansion entirely and can never exceed 100%. Use for renewal reporting, board metrics, or CS portfolio health.
---

# Renewal & Expansion Revenue Waterfall Analyzer

A revenue-bridge and retention-metric engine, not a live billing integration. You supply
each account's previous and current ARR; this deterministically classifies every account
and computes the two most commonly confused SaaS metrics correctly.

## What this is (and isn't)

Pure functions over the account ARR data you supply. Not a hosted finance/BI tool and
not a direct connection to any specific billing or CRM platform's revenue data.

## Files

| File | Purpose |
|---|---|
| `waterfall.js` | `classifyAccountChange()`, `buildRevenueWaterfall()` — zero dependencies |
| `test.js` | 19-test suite, hand-verified against a known 5-account waterfall example including exact NRR/GRR values |

## How to use it

```js
const { buildRevenueWaterfall } = require('./waterfall.js');

const result = buildRevenueWaterfall([
  { accountId: 'A1', previousARR: 1000, currentARR: 1200 }, // expansion
  { accountId: 'A2', previousARR: 800, currentARR: 0 },     // churned
  { accountId: 'A3', previousARR: 0, currentARR: 300 },     // new logo
]);
// result.nrr, result.grr -> the two retention metrics, correctly distinct
// result.newARR, result.expansionARR, result.contractionARR, result.churnedARR -> the bridge
// result.byAccount -> per-account classification for audit/drill-down
```

## The two real guardrails

1. **One deterministic classification rule per account** — new / expansion / contraction
   / churned / flat, applied consistently instead of by hand, removing analyst-to-analyst
   inconsistency in how the same account gets labeled.
2. **NRR and GRR use their correct, distinct definitions** — NRR credits expansion ARR
   and can legitimately exceed 100%; GRR excludes expansion entirely and, by construction,
   can never exceed 100%. Conflating the two (a common real mistake) makes retention look
   better than it is. The function also throws rather than returning a misleading number
   when the account set has no existing revenue base to measure retention against.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real billing platform's actual ARR and subscription data.
