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
| `pipeline.js` | `PLATFORM_PROFILES`, `diagnoseIncident()`, `runRootCauseAnalysis()`, `wasScannerUp()` — attributes each stuck listing to a pipeline stage |
| `storefront.js` | `validateSnapshot()`, `diffSnapshots()`, `confirmDisappearances()`, `reconcileWithLedger()`, `buildStorefrontReport()` — the detector that needs no sale feed |
| `test.js` | 45-test suite covering status normalization, timezone rejection, all four root-cause classifications, the repost grace window, per-platform cadence, source-quantity overrides, and plan generation |
| `test-pipeline.js` | 31-test suite covering stage attribution, scanner-uptime logic, cause precedence, and RCA aggregation |
| `test-storefront.js` | 34-test suite covering snapshot validation, truncated-fetch suppression, confirmation streaks, and ledger reconciliation |

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

## Stage attribution (`pipeline.js`)

`availability.js` tells you a listing is wrong. `pipeline.js` tells you which stage of
your cross-listing stack broke, because the fixes do not overlap:

| Stage | What it does | Typical failure |
|---|---|---|
| `detect` | Notices the sale on the platform it happened on | The sale landed while the scanner was not running |
| `dispatch` | Removes the item everywhere else | Quantity > 1, an active offer, an unlinked listing, a dead session |
| `publish` | Relist/bump jobs rewrite listings from the local catalog | A relister recreates an item that sold |

Two structural facts drive most real-world failures, and both are documented vendor
behavior rather than bugs:

1. **Detection for marketplace platforms usually runs client-side.** Only API-backed
   platforms (eBay, Etsy, Shopify) are detected server-side. Poshmark, Depop, Mercari,
   Whatnot and friends are polled by a browser extension every 10–15 minutes, and only
   while the computer is on, awake, and the tool's tab is open. A sale that lands while
   the machine is asleep is usually not detected late — it is never detected, because the
   scanner reads current state instead of backfilling history.
2. **Multi-quantity items are decremented, not delisted.** Auto-delist typically removes
   an item only when the last unit sells. A one-of-one collectible carrying quantity > 1
   in the catalog will never be taken down automatically on any quantity-aware platform.

```js
const { runRootCauseAnalysis } = require('./pipeline.js');

const { ranked, stageShare } = runRootCauseAnalysis(
  [{
    item: 'Star Wars comic packs',
    salePlatform: 'poshmark',              // where it actually sold
    soldAt: '2026-09-19T05:00:00Z',
    detectedAt: null,                      // the tool never recorded it
    stuckOn: ['ebay', 'mercari', 'depop'], // still live here
  }],
  { uptimeWindows: [{ from: '2026-09-19T13:00:00Z', to: '2026-09-20T00:00:00Z' }] }
);

// stageShare -> { detect: 100 }
// ranked[0]  -> detection_missed_offline, with the fix attached
```

Causes are attributed in precedence order, worst-explanation-first: a repost is blamed on
the publisher even when detection also failed (the relister ran regardless), an undetected
sale outranks every dispatch-side cause (nothing downstream could have run), and an
unlinked listing outranks quantity and offer blocks (the tool cannot delist what it does
not know it owns). `runRootCauseAnalysis()` rolls a batch of incidents up into a ranked
table with each cause's share of the damage.

## Storefront differ (`storefront.js`)

Every marketplace publishes the seller's own shop as a public page. Polling it and
diffing against the ledger answers the question that actually matters — *is this item
still live where it shouldn't be?* — with no API, no login, no notification email and no
cross-listing tool in the path. It is also the only detector that finds **orphans**:
listings live on a platform that the ledger has no record of, which no sale event will
ever reference.

```js
const { buildStorefrontReport } = require('./storefront.js');

const report = buildStorefrontReport({
  snapshotsByPlatform: {
    // oldest first; the fetch layer supplies these, this module never does network I/O
    poshmark: [snapshotA, snapshotB, snapshotC],
  },
  ledger,   // [{ sku, status, listings: [{ platform, listingId }] }]
});

// report.byPlatform.poshmark.saleSignals   -> confirmed disappearances
// report.byPlatform.poshmark.shouldBeGone  -> ledger says sold, storefront still shows it
// report.byPlatform.poshmark.orphans       -> live, and the ledger has never heard of it
// report.byPlatform.poshmark.untrustedPolls-> fetches that were not safe to conclude from
```

### Why a disappearance is the dangerous event

`shouldBeGone` and `orphans` are presence-based — they are safe to conclude from a partial
page, because seeing something proves it is there. `saleSignals` are absence-based, and
acting on them writes to inventory. A storefront fetch that returns a truncated page —
pagination missed, rate limit, markup change, transient error — makes every unseen item
look sold. Decrementing stock on that would be exactly the inventory corruption the rest
of this skill exists to prevent.

So two gates stand in front of every sale signal:

1. **A snapshot must prove itself complete.** The fetch layer must state `complete`
   explicitly — omitting it is an error, not a default — and a snapshot is additionally
   distrusted when its item count disagrees with the total the page itself advertised, or
   when more listings vanished at once than a real sell-through would explain. That last
   test is a ratio *above an absolute floor*, because a shop holding five listings trips
   any ratio the moment one sells. An untrusted diff reports **zero** disappearances and
   says how many it suppressed.
2. **A disappearance must repeat.** An item must be absent across consecutive trusted
   snapshots (default 2) before it becomes a sale signal, and an untrusted poll ends the
   window rather than extending the streak through it. One flaky fetch never moves stock.

Absence is counted from snapshot membership rather than diff events, since an item that
stays gone produces one disappearance event but many absent snapshots.

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

### Quantity beats the status word

An inventory record may carry an optional `quantity`, and when it disagrees with the
status word, quantity wins. This is not hypothetical: eBay's Out-of-Stock Control keeps a
fixed-price listing **active** at quantity 0 and merely hides it from search, so a source
of truth read by status alone records a sold-out item as available — in the one record
every other platform keys off. `reconcileListings()` rewrites that to `sold` and reports
`sourceQuantityOverride: 'zero_quantity_still_active'` so the override is visible rather
than silent.

The same field matters in the other direction. Most cross-listers delist other platforms
only when the **last** unit sells; above that they decrement. A one-of-one item carrying
quantity > 1 therefore never triggers a delist anywhere. `sourceQuantity` is surfaced on
every finding so a stuck listing can be attributed to catalog quantity rather than to sync.

## Calibrating it

`syncWindowMinutes` should be your *actual* cadence per platform, not your intended one
— if a feed is scheduled every 4 hours, that's `240`, and everything slower than that is
a genuine defect rather than expected latency. Set it too generously and real failures
read as normal lag; set it below your true cadence and healthy syncs look broken. Note
that several platforms also expire listings on their own timeline rather than on removal,
so a row disappearing from your feed is not the same as the listing coming down.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real platforms' listing export and delist APIs, including the fetch
layer that produces storefront snapshots — which is platform-specific, brittle by nature,
and should stay gentle and within each marketplace's terms.

`PLATFORM_PROFILES` encodes per-platform detection transport, poll interval, delist
action, and whether the platform refuses to delete a listing with a live offer. Vendors
change this behavior — override any entry via the `profiles` option rather than trusting
the defaults indefinitely.
