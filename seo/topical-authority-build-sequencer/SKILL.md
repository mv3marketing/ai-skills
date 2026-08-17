---
name: topical-authority-build-sequencer
description: Models the site as a weighted directed link graph and runs a real iterative PageRank computation (Google's original algorithm, zero dependencies), then sequences which not-yet-built page to build next based on internal equity it would actually receive from already-built pages - not just search volume. Use when planning a pSEO or content-cluster build order.
---

# Topical Authority Build-Sequencer

Sequencing content builds by search volume alone ignores the internal-linking reality: a
page that will receive strong internal links from already-authoritative pages needs less
external backlink-building to rank than one that would launch as an orphan. This skill
computes real PageRank-style equity flow to find that build order.

## What this is (and isn't)

A graph algorithm over the link structure you supply, not a hosted service or a live
crawler. Real PageRank math (Google's original algorithm), not a volume sort.

## Files

| File | Purpose |
|---|---|
| `sequencer.js` | `computePageRank()` and `sequenceBuild()` — zero dependencies |
| `test.js` | 12-test suite, including known-value regression tests (symmetric cycle, hub-and-spoke, dangling nodes) |

## How to use it

```js
const { sequenceBuild } = require('./sequencer.js');

const built = ['pillar-page', 'category-hub'];
const unbuilt = ['cluster-page-a', 'cluster-page-b', 'cluster-page-c'];
const plannedEdges = [
  { from: 'pillar-page', to: 'cluster-page-a', weight: 3 }, // planned nav-level link
  { from: 'category-hub', to: 'cluster-page-b', weight: 1 }, // planned in-content link
  // ...the full planned link graph, including edges among not-yet-built pages
];

const sequence = sequenceBuild(built, unbuilt, plannedEdges);
// [{ pageId: 'cluster-page-a', incomingEquityFromBuilt: 0.14 }, ...] sorted highest first
```

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
extracting your real internal-link graph and running this against your actual pSEO or
content-cluster backlog.
