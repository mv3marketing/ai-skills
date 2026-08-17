---
name: media-mix-incrementality-test-designer
description: Real two-proportion sample-size power calculation (Acklam's inverse normal CDF approximation, zero dependencies) for designing a geo-holdout incrementality test, plus a balanced test/control geo split and test-duration estimate. Replaces last-click attribution assumptions with real causal-test design. Use before launching any incrementality/lift test.
---

# Media-Mix Incrementality Test Designer

Wrong sample-size or test-duration assumptions produce an inconclusive or misleading
incrementality test. This skill runs the real statistical power calculation, not a rule of
thumb, plus a real greedy-balancing algorithm for splitting candidate geos into test/control.

## What this is (and isn't)

A statistics and set-balancing function over data you supply, not a hosted testing platform
or a live media-buying integration.

## Files

| File | Purpose |
|---|---|
| `designer.js` | `computeRequiredSampleSize()`, `splitGeosForTest()`, `estimateTestDurationDays()`, plus exported `inverseNormalCdf()` — zero dependencies |
| `test.js` | 18-test suite, including known-value regression tests for the inverse normal CDF and a hand-verified sample-size calculation |

## How to use it

```js
const { computeRequiredSampleSize, splitGeosForTest, estimateTestDurationDays } = require('./designer.js');

const requiredN = computeRequiredSampleSize(0.05, 0.1, { power: 0.8, alpha: 0.05 }); // baseline 5% CVR, detect a 10% relative lift
const geoSplit = splitGeosForTest(candidateGeos); // { test: [...], control: [...] }
const days = estimateTestDurationDays(requiredN, dailyConversionsPerGroup);
```

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help running
this against your real geo/conversion data and standing up the actual holdout test.
