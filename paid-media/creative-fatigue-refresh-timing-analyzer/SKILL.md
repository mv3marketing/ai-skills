---
name: creative-fatigue-refresh-timing-analyzer
description: Fits an exponential decay curve to CTR vs. days-live and projects the specific calendar date a creative will cross a fatigue threshold, instead of a static "-X% drop" rule. Use when you have daily/periodic CTR history for a running ad creative and want a specific refresh-by date.
---

# Creative Fatigue & Refresh-Timing Analyzer

Most "creative fatigue" alerts are a static rule: "CTR dropped 20%, flag it." That fires after
the damage is already done. This skill instead fits a real exponential decay curve to your
CTR history and projects the actual calendar date CTR will cross your fatigue threshold.

## What this is (and isn't)

A curve-fit and projection function, not a hosted service or an ad-platform integration. It
runs entirely in your own environment against CTR history you supply.

## Files

| File | Purpose |
|---|---|
| `analyzer.js` | `fitDecayCurve()` and `projectRefreshDate()` — zero dependencies |
| `test.js` | 12-test suite covering curve recovery, flat-creative handling, and date math |

## How to use it

```js
const { fitDecayCurve, projectRefreshDate } = require('./analyzer.js');

const history = [
  { daysLive: 0, ctr: 0.048 },
  { daysLive: 7, ctr: 0.041 },
  { daysLive: 14, ctr: 0.035 },
  { daysLive: 21, ctr: 0.030 },
];

const model = fitDecayCurve(history);
// model.ctr0, model.k, model.rSquared

const projection = projectRefreshDate(model, 0.015, '2026-07-01');
// projection.daysUntilFatigue, projection.refreshByDate, projection.alreadyFatigued
```

## Why this is a real gap

AdCreative.ai and similar tools score creative variants, but this research found nothing
that fits a real decay curve and projects a specific refresh-by date the way this does. A
flat or improving creative (k &le; 0) correctly returns no fatigue projection, rather than
a false alarm.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real ad platforms (Google, Meta, LinkedIn) so refresh dates surface automatically.
