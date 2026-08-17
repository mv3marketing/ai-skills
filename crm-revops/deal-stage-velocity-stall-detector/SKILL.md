---
name: deal-stage-velocity-stall-detector
description: Flags deals stalled in their current pipeline stage using real per-stage historical benchmarks (quartiles + Tukey's IQR outlier fence) instead of one arbitrary "days in stage" threshold applied to every stage alike, and projects expected close dates from remaining-stage medians. Use when auditing CRM pipeline health or building automated stall alerts.
---

# Deal Stage Velocity & Stall Detector

A benchmarking and outlier-detection engine, not a live CRM integration. You supply
historical closed-deal stage histories and the current open pipeline; this computes
real per-stage norms and flags genuine outliers against them.

## What this is (and isn't)

A pure function over the deal data you supply. Not a hosted service and not a direct
connection to any specific CRM's API.

## Files

| File | Purpose |
|---|---|
| `detector.js` | `percentile()`, `computeStageBenchmarks()`, `evaluateDealStall()`, `projectExpectedCloseDate()` — zero dependencies |
| `test.js` | 19-test suite including hand-verified quartile math against known values |

## How to use it

```js
const { computeStageBenchmarks, evaluateDealStall, projectExpectedCloseDate } = require('./detector.js');

// 1. Build benchmarks from CLOSED deals with complete stage histories
const benchmarks = computeStageBenchmarks(closedDeals);
// benchmarks.Evaluation -> { median, q1, q3, stallThresholdDays, sampleSize, insufficientSample }

// 2. Evaluate an open deal against its current stage's benchmark
const result = evaluateDealStall(
  { dealId: 'D-1044', currentStage: 'Evaluation', enteredCurrentStageAt: '2026-01-01T00:00:00Z' },
  benchmarks
);
// result.isStalled -> true if daysInStage exceeds that stage's Tukey fence

// 3. Project an expected close date from remaining pipeline stages
const projection = projectExpectedCloseDate(deal, ['Legal', 'Contracting'], benchmarks);
```

## The two real guardrails

1. **Per-stage benchmarks, not one sitewide threshold** — a stage that normally runs
   long (say, Legal review) isn't judged against a stage that normally runs short
   (say, Discovery). Every stage gets its own median/Q1/Q3 computed from real historical
   completions.
2. **Tukey's IQR outlier fence (Q3 + 1.5×IQR)** instead of a mean/stdev threshold, since
   a handful of already-stalled deals in the training data would otherwise drag the mean
   and stdev toward themselves and mask exactly the pattern being detected. Stages with
   fewer than `minSampleSize` (default 5) historical completions are marked
   `insufficientSample` rather than given a fabricated benchmark — no verdict ships
   without enough data to support one.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real CRM's actual deal and stage-history data.
