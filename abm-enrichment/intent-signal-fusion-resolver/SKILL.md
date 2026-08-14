---
name: intent-signal-fusion-resolver
description: Fuses intent signals from 2+ sources (6sense, ZoomInfo, Clay, etc.) into one composite per-topic score using recency decay and a noisy-OR combination, instead of naive summation which double-counts when multiple vendors flag the same real-world surge. Use when running ABM with more than one intent data source.
---

# Multi-Source Intent Signal Fusion & Conflict Resolver

Vendors define "surge" differently, and naive summation double-counts when two vendors
report the same real-world event. This skill fuses signals with a **noisy-OR** combination
(`1 - product(1 - strength_i)` across sources) — bounded in [0,1] and correctly modeling
"probability at least one source detected real intent," not an unbounded additive score.

## What this is (and isn't)

A fusion function over signals you supply, not a hosted service or a vendor integration
itself. It runs entirely in your own environment.

## Files

| File | Purpose |
|---|---|
| `resolver.js` | `fuseIntentSignals()` and `decayedStrength()` — zero dependencies |
| `test.js` | 14-test suite covering decay, noisy-OR bounding, topic separation, and sort order |

## How to use it

```js
const { fuseIntentSignals } = require('./resolver.js');

const signals = [
  { source: '6sense', topic: 'competitor-x', strength: 0.6, timestampISO: '2026-08-08' },
  { source: 'ZoomInfo', topic: 'competitor-x', strength: 0.5, timestampISO: '2026-08-10' },
  { source: 'Clay', topic: 'pricing-page-visit', strength: 0.3, timestampISO: '2026-08-09' },
];

const fused = fuseIntentSignals(signals, '2026-08-10', { halfLifeDays: 14 });
// fused -> [{ topic, compositeScore, sourceCount, contributingSources }, ...] sorted highest first
```

## Why naive summation is wrong

Two sources each reporting 0.5 strength on the same topic should NOT sum to 1.0 (or higher,
with a third source) — that overstates confidence and is unbounded. Noisy-OR combines them
to 0.75: meaningfully higher than either alone (real corroboration), but bounded and
resistant to runaway inflation as more sources pile on.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real intent data sources (Clay, ZoomInfo, 6sense) so fused scores update automatically.
