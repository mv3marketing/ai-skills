---
name: account-reach-frequency-saturation-modeler
description: Models effective reach and frequency saturation across a target account's buying committee using the standard diminishing-returns exposure curve from media-planning theory, calibrated from your own historical engagement data rather than an assumed constant. Flags under-reached committees needing more touches and oversaturated ones where additional spend has low marginal value. Use for ABM media/outreach planning.
---

# Account Reach & Frequency Saturation Modeler

A reach-curve modeling engine, not a live ad-platform or CRM integration. You supply
impression counts and (optionally) historical engagement data to calibrate the model;
this computes real, exact reach probabilities and saturation classifications.

## What this is (and isn't)

Pure functions over the account/contact data you supply. Not a hosted media-planning
tool and not a direct connection to any specific ad platform's delivery API.

## Files

| File | Purpose |
|---|---|
| `modeler.js` | `calibrateAttentionProbability()`, `cumulativeReachProbability()`, `marginalReachGain()`, `modelAccountReach()` — zero dependencies |
| `test.js` | 21-test suite, including hand-verified reach-curve math and a round-trip calibration check |

## How to use it

```js
const { calibrateAttentionProbability, modelAccountReach } = require('./modeler.js');

// 1. Calibrate p from your own historical engagement data (not an assumed constant)
const p = calibrateAttentionProbability(0.5, 4); // 50% of contacts engaged at ~4 avg impressions

// 2. Model the current buying committee
const result = modelAccountReach(
  [
    { contactId: 'c1', role: 'Champion', impressions: 10 },
    { contactId: 'c2', role: 'Economic Buyer', impressions: 2 },
  ],
  p
);
// result.combinedCommitteeReach -> probability at least one committee member has been reached
// result.contacts[i].isUnderreached / isOversaturated -> per-contact flags
```

## The two real guardrails

1. **Calibrated from your own data, not an assumed constant** — the per-impression
   attention probability is solved by inverting the reach curve against a real observed
   engagement rate and average impression count you supply, rather than guessing at a
   number. `calibrateAttentionProbability()` round-trips exactly back through
   `cumulativeReachProbability()`.
2. **Correct multi-person combination, not a sum** — reach across a buying committee is
   computed as the probability at least one person was reached (`1 - product of miss
   probabilities`), the mathematically correct combination under the standard
   independence assumption, stated explicitly rather than silently baked in. Summing
   individual reach probabilities (a common naive mistake) can exceed 100% and is
   deliberately avoided.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real ad platform's actual delivery and engagement data.
