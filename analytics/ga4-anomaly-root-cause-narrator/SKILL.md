---
name: ga4-anomaly-root-cause-narrator
description: Cross-references a GA4 metric anomaly against GSC ranking-change, GTM tag-publish, and ad-spend-change events, ranking candidate causes by timing proximity and category prior. Use when a metric moved and you need to separate "tracking broke" from "real demand shift" instead of guessing.
---

# GA4 Anomaly Root-Cause Narrator

The single most common false alarm in analytics ops: "tracking broke" vs. "real demand
shift" look identical on a line chart. This skill cross-references the anomaly date against
a list of candidate causal events and ranks them by timing proximity and category prior.

## What this is (and isn't)

A ranking function over events you supply, not a hosted service or a live GA4/GSC/GTM
integration itself. It doesn't pull the events for you — you feed it your own GSC ranking
changes, GTM publish log, and ad-platform change history, and it ranks the candidates.

## Files

| File | Purpose |
|---|---|
| `narrator.js` | `narrateAnomaly()` — zero dependencies |
| `test.js` | 12-test suite covering proximity decay, category priors, and ranking order |

## How to use it

```js
const { narrateAnomaly } = require('./narrator.js');

const result = narrateAnomaly('2026-08-10', [
  { type: 'gtm_publish', date: '2026-08-10', description: 'Published new conversion tag config' },
  { type: 'gsc_ranking_change', date: '2026-07-28', description: 'Lost featured snippet on primary keyword' },
  { type: 'ad_spend_change', date: '2026-08-09', description: 'Paused top Google Ads campaign' },
]);

// result.ranked -> sorted by confidence, highest first
// result.topCategory -> "tracking" or "demand"
```

## Known event types

`gtm_publish`, `tag_error`, `gsc_ranking_change`, `ad_spend_change`, `site_change`,
`seasonal` — each mapped to a `tracking` or `demand` category with a documented, editable
prior confidence. These priors are a stated starting point, not a trained model.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real GA4, GSC, and GTM accounts so candidate events are pulled automatically.
