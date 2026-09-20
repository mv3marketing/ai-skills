---
name: cross-platform-listing-availability-reconciler
description: Explains why sold items keep showing as available on other selling channels, by separating the four root causes that produce that one symptom - ordinary sync lag, a sync that missed or runs too slowly, a publisher actively republishing sold listings after the sale, and platform statuses your mapping never recognized. Reconciles a source-of-truth inventory snapshot against per-platform listing snapshots and outputs a per-platform delist plan ranked by oversell risk. Use when the same unit is live on multiple marketplaces or product feeds and sold items are not coming down.
---

# Cross-Platform Listing Availability Reconciler

A reconciliation engine, not a live integration with any marketplace API. You export
your source-of-truth inventory and each platform's current listing state (however that
platform lets you export it), feed both in, and get back a per-listing diagnosis, a
per-platform cause, and a concrete delist plan.

## The thing this exists to settle

"Sold items are showing as available on other platforms" is one symptom with four
different causes, and they need opposite fixes:

| Classification | What actually happened | Fix |
|---|---|---|
| `sync_lag` | The platform hasn't been told yet, and the delay is inside the sync window you actually run. | Nothing is broken. Shorten the window if the oversell risk is unacceptable. |
| `stale_beyond_window` | Wrong for longer than your own cadence should allow — the sync ran and skipped this item, or didn't run. | Delist now, then find the skipped item. |
| `repost_after_sale` | The listing was **written to the platform after the sale** and still says available. | Stop the republisher. Syncing more often makes this worse. |
| `status_mapping_gap` | The platform reports a status your mapping doesn't recognize, so nothing ever classified it as sold. | Add the status to the vocabulary. |

The third row is the one people misdiagnose. If a listing's last write is *later* than
the sale and it still reads available, no amount of latency explains it — a bulk feed
regeneration, a scheduled relister, or a two-way sync loop is recreating the listing
from a source that doesn't know the item sold. Teams respond by increasing sync
frequency, which increases the number of reposts.

## Files

| File | Purpose |
|---|---|
| `availability.js` | `canonicalizeStatus()`, `parseTimestamp()`, `reconcileListings()`, `summarizeByPlatform()`, `buildDelistPlan()` — zero dependencies |
| `test.js` | 40-test suite covering status normalization, timezone rejection, all four root-cause classifications, the repost grace window, per-platform cadence, and plan generation |

## How to use it

```js
const { reconcileListings, summarizeByPlatform, buildDelistPlan } = require('./availability.js');

const { findings } = reconcileListings({
  // your source of truth, one row per sku
  inventory: [{ sku: 'SKU-1', status: 'sold', statusChangedAt: '2026-09-18T14:00:00Z' }],

  // what each platform currently shows, and when your publisher last wrote it
  listings: [
    { platform: 'ebay',     sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' },
    { platform: 'poshmark', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T16:00:00Z' },
  ],

  now: '2026-09-18T18:00:00Z',
  syncWindowMinutes: { ebay: 60, poshmark: 15 }, // your real cadence per platform
});

// ebay     -> stale_beyond_window  (wrong for 240 min against a 60 min window)
// poshmark -> repost_after_sale    (written 120 min AFTER the sale, still available)

summarizeByPlatform(findings);
// poshmark -> { likelyCause: 'publisher_republishes_sold_listings', ... }
// ebay     -> { likelyCause: 'sync_missed_or_cadence_too_slow', medianStaleLagMinutes: 240 }

buildDelistPlan(findings);
// poshmark -> [{ sku: 'SKU-1', action: 'stop_republishing', severity: 'critical', reason: '...' }]
// ebay     -> [{ sku: 'SKU-1', action: 'delist',            severity: 'high',     reason: '...' }]
```

Three more classifications fall out of the same pass: `reserved_but_live` (held in the
source, still buyable elsewhere), `orphan_listing` (live on a platform, absent from the
source — usually item-ID drift after a listing was recreated), and `unlisted_available`
(in stock but dead on a channel, which is lost sales rather than oversell).

## The two real guardrails

1. **Unknown statuses fail closed.** Every platform has its own vocabulary — `active`,
   `in_stock`, `for_sale`, `published`, `sold_out`, `archived`, `expired`. A reconciler
   that defaults anything it doesn't recognize to "available" will let a sold item stay
   live forever and never report it, which is root cause #4 producing symptom #3.
   `canonicalizeStatus()` maps to one of five canonical states and sends everything
   else to `unknown`, which is surfaced as a `status_mapping_gap` finding — never
   silently treated as available, and never silently treated as sold either.
2. **Timestamps must be timezone-explicit.** The entire lag-versus-repost distinction is
   a comparison between two instants. A local-time string from one platform compared
   against another's can be off by up to 14 hours — exactly the window in which a repost
   is misread as ordinary lag, sending you to fix the wrong thing. `parseTimestamp()`
   accepts ISO-8601 with `Z` or a `±HH:MM` offset, epoch milliseconds, or a `Date`, and
   throws on anything ambiguous rather than assuming UTC. A `repostGraceMinutes` window
   (default 5) keeps a write that raced the sale by a few seconds from being reported as
   a republishing bug.

## Calibrating it

`syncWindowMinutes` should be your *actual* cadence per platform, not your intended one
— if a feed is scheduled every 4 hours, that's `240`, and everything slower than that is
a genuine defect rather than expected latency. Set it too generously and real failures
read as normal lag; set it below your true cadence and healthy syncs look broken. Note
that several platforms also expire listings on their own timeline rather than on removal,
so a row disappearing from your feed is not the same as the listing coming down.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real platforms' listing export and delist APIs.
