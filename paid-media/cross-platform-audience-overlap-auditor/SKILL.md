---
name: cross-platform-audience-overlap-auditor
description: Finds an account bidding against itself - campaigns with real, measurable audience-signal overlap (Jaccard similarity) that are NOT deliberately exclusion-linked, whether within one platform (PMax vs Search) or across platforms (Google/Meta/LinkedIn sharing the same uploaded customer list). Use when auditing a paid media account for internal auction competition.
---

# Cross-Platform Audience Overlap Auditor

Attribution double-counting and self-competition both stem from the same root cause: two
campaigns eligible to serve to the same audience with no exclusion carving them apart. This
skill measures real audience-signal overlap and respects deliberate exclusions, so it only
flags genuine, unaddressed self-competition.

## What this is (and isn't)

A set-overlap function over campaign data you supply, not a hosted service or a live
ad-platform integration.

## Files

| File | Purpose |
|---|---|
| `auditor.js` | `findAudienceOverlaps()`, plus exported `jaccardSimilarity()` — zero dependencies |
| `test.js` | 12-test suite covering same-platform, cross-platform, and exclusion-respecting cases |

## How to use it

```js
const { findAudienceOverlaps } = require('./auditor.js');

const campaigns = [
  { campaignId: 'pmax-1', platform: 'google', channel: 'PMax', audienceSignals: ['remarketing-list-A', 'customer-list-1'] },
  { campaignId: 'search-1', platform: 'google', channel: 'Search', audienceSignals: ['remarketing-list-A', 'customer-list-1'] },
];

const overlaps = findAudienceOverlaps(campaigns, { similarityThreshold: 0.3 });
// [{ campaignA, campaignB, platformA, platformB, similarity }, ...]
```

## Why exclusion-awareness matters

A PMax campaign and a Search campaign sharing the same remarketing list is often
intentional, if one explicitly excludes the other's audience. This skill checks
`excludesCampaignIds` on both sides before flagging, so it surfaces real, unaddressed
self-competition rather than every deliberate overlap in the account.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help pulling
your real audience-signal data from Google Ads, Meta, and LinkedIn.
