---
name: sample-ratio-mismatch-auditor
description: Checks whether an A/B test's actual traffic split matches its intended assignment ratio using a real chi-square goodness-of-fit test, with a deliberately strict default significance threshold since sample ratio mismatch should almost never occur under correct random assignment. Use before trusting any A/B test's metric results, to rule out a broken randomization, redirect bug, or bot-filter skew.
---

# Sample-Ratio-Mismatch (SRM) Auditor

A statistical integrity check, not a metric-significance test. Checking whether a test's
traffic split is even correct is a separate, prerequisite question to whether a metric
moved. A test can show a "winning" variant purely because broken randomization skewed how
many users landed in each arm.

## What this is (and isn't)

A pure function over the arm counts you supply. Not a live integration with any
experimentation platform's reporting API.

## Files

| File | Purpose |
|---|---|
| `srm.js` | `computeChiSquareStatistic()`, `pValueChiSquareDf1()`, `detectSRM()`, `detectSRMMultiArm()` — zero dependencies |
| `test.js` | 22-test suite, including the p-value function cross-checked against the standard published chi-square df=1 critical value table |

## How to use it

```js
const { detectSRM } = require('./srm.js');

const result = detectSRM(observedUsersInA, observedUsersInB, { expectedRatioA: 0.5 });
// result.isSRM -> true means the split itself is broken; do not trust the metric results yet
// result.pValue, result.chiSquare -> the underlying statistics
```

For a multi-variant test, `detectSRMMultiArm()` computes the chi-square statistic for any
number of arms, but only returns an exact p-value at 2 arms (1 degree of freedom) — see
the guardrail below.

## The two real guardrails

1. **A deliberately strict default threshold (alpha 0.001, not the usual 0.05)** — under
   correct random assignment, a real ratio mismatch should almost never occur by chance,
   so SRM detection conventionally uses a much stricter bar than a typical experiment
   result to avoid false alarms on ordinary sampling noise, while still catching genuine
   instrumentation bugs.
2. **Honest scope limit on multi-arm tests** — an exact p-value for more than 2 arms
   requires the chi-square CDF for degrees of freedom > 1, which needs the regularized
   incomplete gamma function. Rather than approximate that inaccurately, `detectSRMMultiArm()`
   returns the chi-square statistic and degrees of freedom with `pValue: null` and a note
   telling you to compare against a standard chi-square critical value table — no invented
   number ships in its place.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real experimentation platform's actual assignment data.
