---
name: metrics-rollup-anomaly-flagger
description: Normalizes sequence performance across platforms with different reply/open definitions (auto-reply inflation, Apple Mail Privacy Protection open inflation) and flags real statistical anomalies in a metric's history using a robust median+MAD modified z-score, not a naive mean/stdev average that a prior spike would distort. Use when comparing sequence performance across sales engagement tools or monitoring a metric trend for real deviations.
---

# Metrics Rollup & Anomaly Flagger

A normalization and statistics engine, not a live dashboard or a connection to any real
platform's reporting API. You supply the raw counts each platform reports; this handles
the two parts most naive rollups get wrong: comparability and outlier-resistant anomaly
detection.

## What this is (and isn't)

Pure functions over the metrics data you supply. Not a hosted dashboard and not a direct
integration with any specific sales engagement tool's analytics API.

## Files

| File | Purpose |
|---|---|
| `flagger.js` | `normalizeReplyRate()`, `normalizeOpenRate()`, `rollupMetrics()`, `detectAnomalies()`, `median()`, `medianAbsoluteDeviation()` — zero dependencies |
| `test.js` | 26-test suite covering rate normalization, cross-platform rollup, and anomaly detection including hand-verified statistics |

## How to use it

```js
const { rollupMetrics, detectAnomalies } = require('./flagger.js');

const rollup = rollupMetrics([
  { platform: 'Outreach', sent: 1000, opens: 300, replies: 50, autoReplies: 10, mppAffected: true },
  { platform: 'Salesloft', sent: 500, opens: 150, replies: 20, autoReplies: 0, mppAffected: false },
]);
// rollup.blendedReplyRate -> comparable across platforms (auto-replies excluded)
// rollup.anyUnreliableOpenRates -> true (Outreach is MPP-affected)
// rollup.byPlatform[0].openRateCaveat -> explains why, does not silently "fix" the number

const anomalies = detectAnomalies(
  [10, 12, 11, 9, 13, 100].map((v, i) => ({ period: `week-${i}`, value: v }))
);
// anomalies[5].isAnomaly -> true (the 100 is a real spike against the 10-13 baseline)
```

## The two real guardrails

1. **Honest, not invented, open-rate correction** — a platform affected by Apple Mail
   Privacy Protection has its opens inflated by prefetched tracking pixels, but nobody
   knows the true bias without ground truth. Rather than inventing a "correction factor,"
   `normalizeOpenRate()` marks the metric `reliable: false` with a plain-language reason,
   so it's excluded from cross-platform comparison instead of silently misleading it.
2. **Robust anomaly detection** — `detectAnomalies()` uses the median + MAD modified
   z-score (Iglewicz & Hoaglin, 1993; threshold 3.5 is the standard constant from that
   method) instead of a mean/stdev z-score, because a naive average lets one real prior
   spike distort the baseline used to judge every point after it. Requires a minimum
   baseline size (default 5 points) before flagging anything — no false anomaly claims
   from too little history.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real platforms' actual reporting APIs.
