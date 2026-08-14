---
name: citation-leakage-mapper
description: Finds topics where a competitor is visibly cited by an AI answer engine while your own site has strong topical coverage yet never appears in the citation list - a real, measurable "we're feeding the topic, they get the credit" gap, via Jaccard topic-similarity matching. Use when you have your own page topics and a set of observed AI citation events.
---

# Citation-Leakage Mapper

Correlates GSC-style topic coverage against GEO citation exports and near-duplicate content
matching to find where your own content effectively powers a competitor's visible AI
citation while you get no credit.

## What this is (and isn't)

A topic-similarity matching function over data you supply, not a hosted citation-monitoring
service (Profound, Otterly, Peec, Scrunch are real products for capturing the citation data
itself — this skill analyzes it once you have it).

## Files

| File | Purpose |
|---|---|
| `mapper.js` | `findCitationLeakage()`, plus exported `jaccardSimilarity()`/`tokenize()` — zero dependencies |
| `test.js` | 14-test suite covering real leakage detection, self-citation exclusion, and threshold sensitivity |

## How to use it

```js
const { findCitationLeakage } = require('./mapper.js');

const ourPages = [
  { url: '/blog/cac-payback-period', topics: ['CAC payback period'] },
];
const citations = [
  { topic: 'CAC payback period calculation', citingDomain: 'competitor.com' },
];

const leaks = findCitationLeakage(ourPages, citations, 'oursite.com', { similarityThreshold: 0.4 });
// [{ topic, citingDomain, matchedPage, similarity }, ...]
```

## Why this matters

A citation-leakage finding means: you have real, on-topic content, an AI engine is actively
citing SOMEONE for that exact topic, and it isn't you. That's a specific, actionable content
gap — not "write more content," but "here's the exact topic where you're losing citation
share to a named competitor."

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real GEO citation monitoring data.
