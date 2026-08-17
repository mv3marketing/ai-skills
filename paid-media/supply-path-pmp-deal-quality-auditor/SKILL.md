---
name: supply-path-pmp-deal-quality-auditor
description: Evaluates programmatic supply paths (sellers.json-style chains) for redundant intermediaries and fee stacking - real compounding-fee computation per path (not a naive sum), grouping by publisher to find duplicate paths, and flagging excessive intermediary hop counts. Use when auditing a programmatic media buy for redundant supply-path fee drag.
---

# Supply Path & PMP Deal Quality Auditor

Real ad-tech domain expertise (bid-stream mechanics), not a lookup. Fees along a supply
chain compound (each intermediary takes their cut off what's left, not off the original
spend), so this skill computes the real effective fee, not a naive sum, and groups paths by
publisher to surface exactly where you're paying for a redundant, more expensive route.

## What this is (and isn't)

A fee-computation and grouping function over supply-path data you supply, not a live SSP/DSP
integration or a hosted service.

## Files

| File | Purpose |
|---|---|
| `auditor.js` | `computeTotalFee()`, `countIntermediaries()`, `auditSupplyPaths()` — zero dependencies |
| `test.js` | 13-test suite, including a hand-verified compounding-fee calculation |

## How to use it

```js
const { auditSupplyPaths } = require('./auditor.js');

const paths = [
  { pathId: 'expensive-route', publisherDomain: 'example.com', chain: [
    { sellerId: 'exchange-a', sellerType: 'INTERMEDIARY', feePercent: 0.15 },
    { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.10 },
  ]},
  { pathId: 'direct-route', publisherDomain: 'example.com', chain: [
    { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.10 },
  ]},
];

const audit = auditSupplyPaths(paths, { maxHops: 2 });
// audit.redundantPublishers -> which publisher has duplicate paths, and which one to keep
// audit.excessiveHopPaths -> paths with more intermediaries than your threshold
```

## Why compounding math matters

Two 10% fees along a chain do NOT sum to 20% off the original spend - each fee is taken off
what's already been reduced by the prior one, compounding to 19%. Naive addition
systematically understates real fee drag on longer supply chains.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help pulling
your real sellers.json/supply-chain data and optimizing your actual programmatic buys.
