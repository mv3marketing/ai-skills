---
name: rfm-predictive-segment-designer
description: Real quantile-binning RFM (Recency/Frequency/Monetary) scoring against your own customer distribution, not fixed thresholds that break at a different scale, plus a documented segment rule layer (Champions, At Risk, Lost, etc.). Use when you have per-customer transaction history and want defensible, ready-to-import segment labels.
---

# RFM + Predictive Segment Designer

Classic RFM plus predictive overlays. The real work is in the quantile binning: scores are
computed against YOUR OWN customer distribution (equal-frequency quintiles), not a fixed
"30/60/90 days" rule that means something completely different for a weekly-purchase
business than an annual-renewal one.

## What this is (and isn't)

A scoring and labeling function over transaction data you supply, not a hosted service or a
CRM integration. Runs entirely in your own environment.

## Files

| File | Purpose |
|---|---|
| `segmenter.js` | `quintileScore()`, `scoreCustomers()`, `labelSegment()` — zero dependencies |
| `test.js` | 14-test suite covering quintile binning correctness and segment-rule cases |

## How to use it

```js
const { scoreCustomers } = require('./segmenter.js');

const customers = [
  { id: 'cust_1', daysSinceLastPurchase: 5, purchaseCount: 12, totalSpend: 1400 },
  { id: 'cust_2', daysSinceLastPurchase: 210, purchaseCount: 2, totalSpend: 80 },
  // ...at least 5 customers, for a meaningful quintile distribution
];

const scored = scoreCustomers(customers);
// [{ id, r, f, m, avgScore, segment }, ...]
```

## Segment labels, precisely

`Champions` (recent + high overall score), `New / Promising` (recent but low frequency),
`At Risk` (was strong, recency has dropped), `Lost` (low across the board), `Core`
(everything else). This is **MV3's own documented, simplified rule set**, not a claimed
reproduction of any specific vendor's proprietary RFM taxonomy — stated honestly, not
oversold.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real transaction data and ESP segment import.
