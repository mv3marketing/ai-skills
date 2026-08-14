---
name: ab-significance-validator
description: Real two-proportion z-test (Abramowitz-Stegun erf approximation, zero dependencies) that catches false-positive "winners" on underpowered A/B tests, with a confidence interval on the difference and a minimum-sample-size warning. Use before declaring any email/landing-page/ad-creative A/B test a winner.
---

# A/B Significance Validator

"Variant B has a higher number" is not the same as "variant B is actually better." This
skill runs the real two-proportion z-test most agencies skip, with a confidence interval on
the difference and an explicit warning when sample size is too small to trust the result.

## What this is (and isn't)

A statistics function over the raw counts you supply, not a hosted service or an A/B
testing platform integration.

## Files

| File | Purpose |
|---|---|
| `validator.js` | `twoProportionZTest()`, plus exported `erf()`/`normalCdf()` — zero dependencies |
| `test.js` | 16-test suite, including hand-verified z-statistic values against the pooled-variance formula |

## How to use it

```js
const { twoProportionZTest } = require('./validator.js');

const result = twoProportionZTest(1000, 100, 1000, 120); // variant A: 1000 sent, 100 converted; variant B: 1000 sent, 120 converted
// result.pValue, result.significant, result.confidenceIntervalOfDifference
// result.warning -> non-null if sample size is below the recommended floor
```

## The false-positive trap this catches

```js
twoProportionZTest(20, 2, 20, 3);
// B looks 50% better than A on raw numbers.
// significant: false, warning: sample size is far below the recommended floor.
```

A 50% relative lift sounds dramatic. On 20 users per variant, it's statistical noise, not a
real effect — this skill says so explicitly instead of letting a raw percentage mislead.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real ESP or ad-platform reporting.
