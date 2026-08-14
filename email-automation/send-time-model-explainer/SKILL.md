---
name: send-time-model-explainer
description: Builds a recency-weighted hour x weekday engagement histogram with a minimum-sample-size guard, and recommends a specific send window with a plain-English rationale. Use when you have per-recipient or per-segment open/click timestamps and want a defensible send-time recommendation instead of a generic "Tuesday at 10am" rule.
---

# Send-Time Model Explainer

Send-time optimization is a shipped feature at Dotdigital and Mailchimp (documented 5-25%
open lift), but those are black boxes. This skill gives you the actual bin scores and a
plain-English rationale for the recommendation, including an honest "insufficient data"
result when your sample is too thin to trust.

## What this is (and isn't)

A histogram + recommendation function over engagement events you supply, not a hosted
service or an ESP integration. Runs entirely in your own environment.

## Files

| File | Purpose |
|---|---|
| `explainer.js` | `explainSendTime()` — zero dependencies |
| `test.js` | 12-test suite covering the minimum-sample-size guard, recency weighting, and weight scaling |

## How to use it

```js
const { explainSendTime } = require('./explainer.js');

const result = explainSendTime(engagementEvents, '2026-08-10', { halfLifeDays: 30, minSampleSize: 10 });
// result.recommendedWindow -> { dayOfWeek: 'Tuesday', hour: 10 } or null
// result.confidence -> 'high' | 'low' | 'insufficient_data'
// result.rationale -> plain-English explanation of why
// result.topBins -> the top 5 scoring bins with raw counts, for a sanity check
```

## Why the minimum-sample-size guard matters

A single lucky click at 3am shouldn't recommend sending at 3am. This skill only recommends
a bin once it has enough raw events to trust, and falls back to the best trusted bin (with
`confidence: 'low'`) when the single highest-scoring bin is under-sampled, rather than
silently recommending a fluke.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real ESP (Klaviyo, Mailchimp, ActiveCampaign) so recommendations update automatically.
