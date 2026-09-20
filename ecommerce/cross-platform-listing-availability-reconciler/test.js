'use strict';
const assert = require('assert');
const {
  CANONICAL_STATUSES,
  STATUS_VOCABULARY,
  canonicalizeStatus,
  parseTimestamp,
  reconcileListings,
  summarizeByPlatform,
  buildDelistPlan,
} = require('./availability.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name} -> ${e.message}`);
    process.exitCode = 1;
  }
}

const SOLD_AT = '2026-09-18T14:00:00Z';
const NOW = '2026-09-18T18:00:00Z'; // 240 minutes after the sale

function soldInventory(sku = 'SKU-1') {
  return [{ sku, status: 'sold', statusChangedAt: SOLD_AT }];
}

// --- canonicalizeStatus ---
test('maps a platform "active" status to available', () => {
  assert.strictEqual(canonicalizeStatus('active'), 'available');
});

test('normalizes case, spaces, and hyphens before mapping', () => {
  assert.strictEqual(canonicalizeStatus('  In-Stock '), 'available');
  assert.strictEqual(canonicalizeStatus('OUT OF STOCK'), 'sold');
});

test('maps end-of-life vocabularies to ended, not sold', () => {
  assert.strictEqual(canonicalizeStatus('archived'), 'ended');
  assert.strictEqual(canonicalizeStatus('expired'), 'ended');
});

test('maps holds to reserved rather than available', () => {
  assert.strictEqual(canonicalizeStatus('pending_payment'), 'reserved');
});

test('fails closed: an unrecognized status is unknown, never available', () => {
  assert.strictEqual(canonicalizeStatus('GTIN_SUPPRESSED'), 'unknown');
});

test('null, undefined, and empty statuses are unknown, not available', () => {
  assert.strictEqual(canonicalizeStatus(null), 'unknown');
  assert.strictEqual(canonicalizeStatus(undefined), 'unknown');
  assert.strictEqual(canonicalizeStatus('   '), 'unknown');
});

test('throws on a non-string status (schema bug, not a mapping gap)', () => {
  assert.throws(() => canonicalizeStatus(1), /must be a string/);
});

test('no raw status string is claimed by two canonical states', () => {
  const seen = new Set();
  for (const list of Object.values(STATUS_VOCABULARY)) {
    for (const raw of list) {
      assert.ok(!seen.has(raw), `"${raw}" is mapped twice`);
      seen.add(raw);
    }
  }
});

test('CANONICAL_STATUSES covers every vocabulary key plus unknown', () => {
  assert.deepStrictEqual(
    [...Object.keys(STATUS_VOCABULARY), 'unknown'].sort(),
    [...CANONICAL_STATUSES].sort()
  );
});

// --- parseTimestamp ---
test('parses a Z-suffixed ISO timestamp', () => {
  assert.strictEqual(parseTimestamp('2026-09-18T14:00:00Z'), Date.UTC(2026, 8, 18, 14, 0, 0));
});

test('parses an offset-suffixed ISO timestamp to the same instant', () => {
  assert.strictEqual(
    parseTimestamp('2026-09-18T10:00:00-04:00'),
    parseTimestamp('2026-09-18T14:00:00Z')
  );
});

test('rejects a timezone-ambiguous local timestamp', () => {
  assert.throws(() => parseTimestamp('2026-09-18T14:00:00'), /not timezone-explicit/);
  assert.throws(() => parseTimestamp('2026-09-18 14:00:00'), /not timezone-explicit/);
});

test('rejects a date-only string (midnight in whose timezone?)', () => {
  assert.throws(() => parseTimestamp('2026-09-18'), /not timezone-explicit/);
});

test('accepts epoch ms and Date objects unchanged', () => {
  assert.strictEqual(parseTimestamp(1758204000000), 1758204000000);
  assert.strictEqual(parseTimestamp(new Date(1758204000000)), 1758204000000);
});

test('throws on a missing timestamp with the field name in the message', () => {
  assert.throws(() => parseTimestamp(undefined, 'listing.lastWrittenAt'), /listing\.lastWrittenAt is required/);
});

test('throws on an Invalid Date', () => {
  assert.throws(() => parseTimestamp(new Date('nope')), /invalid Date/);
});

// --- the four root causes ---
test('sync_lag: listing written before the sale, still inside the sync window', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'ebay', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' }],
    now: '2026-09-18T14:30:00Z', // 30 min after the sale
    defaultSyncWindowMinutes: 60,
  });
  assert.strictEqual(findings[0].classification, 'sync_lag');
  assert.strictEqual(findings[0].severity, 'low');
  assert.strictEqual(findings[0].action, 'wait');
  assert.strictEqual(findings[0].lagMinutes, 30);
});

test('stale_beyond_window: same shape, but wrong for longer than the cadence allows', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'ebay', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' }],
    now: NOW,
    defaultSyncWindowMinutes: 60,
  });
  assert.strictEqual(findings[0].classification, 'stale_beyond_window');
  assert.strictEqual(findings[0].severity, 'high');
  assert.strictEqual(findings[0].action, 'delist');
  assert.strictEqual(findings[0].lagMinutes, 240);
});

test('repost_after_sale: the listing was written AFTER the sale and still says available', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'poshmark', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T15:00:00Z' }],
    now: NOW,
  });
  assert.strictEqual(findings[0].classification, 'repost_after_sale');
  assert.strictEqual(findings[0].severity, 'critical');
  assert.strictEqual(findings[0].action, 'stop_republishing');
  assert.match(findings[0].detail, /not latency/);
});

test('a repost is never downgraded to lag by a generous sync window', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'poshmark', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T15:00:00Z' }],
    now: NOW,
    defaultSyncWindowMinutes: 10080, // a week
  });
  assert.strictEqual(findings[0].classification, 'repost_after_sale');
});

test('a write moments after the sale is a race, not a repost accusation', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'mercari', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T14:02:00Z' }],
    now: '2026-09-18T14:10:00Z',
    repostGraceMinutes: 5,
  });
  assert.strictEqual(findings[0].classification, 'sync_lag');
});

test('a write just past the grace window is a repost', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'mercari', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T14:06:00Z' }],
    now: '2026-09-18T14:10:00Z',
    repostGraceMinutes: 5,
  });
  assert.strictEqual(findings[0].classification, 'repost_after_sale');
});

test('status_mapping_gap: an unmapped platform status is flagged, not assumed sold or available', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'google', sku: 'SKU-1', status: 'limited_availability', lastWrittenAt: SOLD_AT }],
    now: NOW,
  });
  assert.strictEqual(findings[0].classification, 'status_mapping_gap');
  assert.strictEqual(findings[0].action, 'map_status');
  assert.strictEqual(findings[0].listingStatus, 'unknown');
});

// --- the other drift shapes ---
test('reserved_but_live: a held unit still buyable elsewhere', () => {
  const { findings } = reconcileListings({
    inventory: [{ sku: 'SKU-1', status: 'pending_payment', statusChangedAt: SOLD_AT }],
    listings: [{ platform: 'etsy', sku: 'SKU-1', status: 'active', lastWrittenAt: SOLD_AT }],
    now: NOW,
  });
  assert.strictEqual(findings[0].classification, 'reserved_but_live');
  assert.strictEqual(findings[0].severity, 'high');
});

test('orphan_listing: live on a platform, absent from the source of truth', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory('SKU-1'),
    listings: [{ platform: 'ebay', sku: 'SKU-999', status: 'active', lastWrittenAt: SOLD_AT }],
    now: NOW,
  });
  assert.strictEqual(findings[0].classification, 'orphan_listing');
  assert.strictEqual(findings[0].sourceStatus, null);
});

test('unlisted_available: in stock in the source, dead on the platform', () => {
  const { findings } = reconcileListings({
    inventory: [{ sku: 'SKU-1', status: 'in_stock', statusChangedAt: SOLD_AT }],
    listings: [{ platform: 'ebay', sku: 'SKU-1', status: 'ended', lastWrittenAt: SOLD_AT }],
    now: NOW,
  });
  assert.strictEqual(findings[0].classification, 'unlisted_available');
  assert.strictEqual(findings[0].action, 'relist');
});

test('in_sync when both sides agree the item is gone', () => {
  const { findings, counts } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'ebay', sku: 'SKU-1', status: 'sold_out', lastWrittenAt: NOW }],
    now: NOW,
  });
  assert.strictEqual(findings[0].classification, 'in_sync');
  assert.deepStrictEqual(counts, { in_sync: 1 });
});

test('an ended source item still live on a platform is treated like a sold one', () => {
  const { findings } = reconcileListings({
    inventory: [{ sku: 'SKU-1', status: 'archived', statusChangedAt: SOLD_AT }],
    listings: [{ platform: 'ebay', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T16:00:00Z' }],
    now: NOW,
  });
  assert.strictEqual(findings[0].classification, 'repost_after_sale');
});

// --- per-platform windows, ordering, validation ---
test('a per-platform sync window overrides the default', () => {
  const listings = [
    { platform: 'fast', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' },
    { platform: 'slow', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' },
  ];
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings,
    now: NOW,
    syncWindowMinutes: { fast: 15, slow: 1440 },
  });
  const byPlatform = Object.fromEntries(findings.map((f) => [f.platform, f.classification]));
  assert.strictEqual(byPlatform.fast, 'stale_beyond_window');
  assert.strictEqual(byPlatform.slow, 'sync_lag');
});

test('findings sort worst-first', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [
      { platform: 'a', sku: 'SKU-1', status: 'sold', lastWrittenAt: NOW },
      { platform: 'b', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T16:00:00Z' },
      { platform: 'c', sku: 'SKU-1', status: 'weird_status', lastWrittenAt: NOW },
    ],
    now: NOW,
  });
  assert.deepStrictEqual(findings.map((f) => f.classification), [
    'repost_after_sale',
    'status_mapping_gap',
    'in_sync',
  ]);
});

test('rejects a duplicate sku in the source of truth', () => {
  assert.throws(
    () => reconcileListings({
      inventory: [
        { sku: 'SKU-1', status: 'sold', statusChangedAt: SOLD_AT },
        { sku: 'SKU-1', status: 'active', statusChangedAt: SOLD_AT },
      ],
      listings: [],
      now: NOW,
    }),
    /Duplicate sku/
  );
});

test('rejects an empty inventory and a non-positive sync window', () => {
  assert.throws(() => reconcileListings({ inventory: [], listings: [], now: NOW }), /non-empty array/);
  assert.throws(
    () => reconcileListings({ inventory: soldInventory(), listings: [], now: NOW, syncWindowMinutes: { ebay: 0 } }),
    /positive number/
  );
});

test('rejects a listing missing platform or sku', () => {
  assert.throws(
    () => reconcileListings({ inventory: soldInventory(), listings: [{ sku: 'SKU-1', status: 'active', lastWrittenAt: NOW }], now: NOW }),
    /non-empty string platform/
  );
  assert.throws(
    () => reconcileListings({ inventory: soldInventory(), listings: [{ platform: 'ebay', status: 'active', lastWrittenAt: NOW }], now: NOW }),
    /non-empty string sku/
  );
});

// --- summarizeByPlatform ---
test('names republishing as the cause when any repost is present', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [
      { platform: 'poshmark', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T16:00:00Z' },
      { platform: 'ebay', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' },
    ],
    now: NOW,
  });
  const summary = summarizeByPlatform(findings);
  assert.strictEqual(summary.poshmark.likelyCause, 'publisher_republishes_sold_listings');
  assert.strictEqual(summary.ebay.likelyCause, 'sync_missed_or_cadence_too_slow');
});

test('reports a median stale lag per platform and null where there is none', () => {
  const { findings } = reconcileListings({
    inventory: [
      { sku: 'A', status: 'sold', statusChangedAt: '2026-09-18T17:00:00Z' },
      { sku: 'B', status: 'sold', statusChangedAt: '2026-09-18T15:00:00Z' },
      { sku: 'C', status: 'sold', statusChangedAt: NOW },
    ],
    listings: [
      { platform: 'ebay', sku: 'A', status: 'active', lastWrittenAt: '2026-09-18T12:00:00Z' },
      { platform: 'ebay', sku: 'B', status: 'active', lastWrittenAt: '2026-09-18T12:00:00Z' },
      { platform: 'etsy', sku: 'C', status: 'sold', lastWrittenAt: NOW },
    ],
    now: NOW,
  });
  const summary = summarizeByPlatform(findings);
  assert.strictEqual(summary.ebay.medianStaleLagMinutes, 120); // 60 and 180
  assert.strictEqual(summary.etsy.medianStaleLagMinutes, null);
  assert.strictEqual(summary.etsy.likelyCause, 'clean');
});

test('a mapping gap outranks cadence as the reported cause', () => {
  const { findings } = reconcileListings({
    inventory: [
      { sku: 'A', status: 'sold', statusChangedAt: SOLD_AT },
      { sku: 'B', status: 'sold', statusChangedAt: SOLD_AT },
    ],
    listings: [
      { platform: 'google', sku: 'A', status: 'limited_availability', lastWrittenAt: SOLD_AT },
      { platform: 'google', sku: 'B', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' },
    ],
    now: NOW,
  });
  assert.strictEqual(summarizeByPlatform(findings).google.likelyCause, 'unmapped_status_vocabulary');
});

// --- buildDelistPlan ---
test('the plan holds actionable findings only, grouped by platform, worst-first', () => {
  const { findings } = reconcileListings({
    inventory: [
      { sku: 'A', status: 'sold', statusChangedAt: SOLD_AT },
      { sku: 'B', status: 'sold', statusChangedAt: SOLD_AT },
      { sku: 'C', status: 'sold', statusChangedAt: SOLD_AT },
    ],
    listings: [
      { platform: 'ebay', sku: 'A', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z', listingId: 'E-1' },
      { platform: 'ebay', sku: 'B', status: 'active', lastWrittenAt: '2026-09-18T16:00:00Z', listingId: 'E-2' },
      { platform: 'ebay', sku: 'C', status: 'sold', lastWrittenAt: NOW, listingId: 'E-3' },
    ],
    now: NOW,
  });
  const plan = buildDelistPlan(findings);
  assert.strictEqual(plan.ebay.length, 2); // the in_sync row is excluded
  assert.deepStrictEqual(plan.ebay.map((i) => i.sku), ['B', 'A']);
  assert.strictEqual(plan.ebay[0].action, 'stop_republishing');
  assert.strictEqual(plan.ebay[0].listingId, 'E-2');
  assert.strictEqual(plan.ebay[1].action, 'delist');
});

test('a self-healing sync_lag stays out of the plan', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'ebay', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T13:00:00Z' }],
    now: '2026-09-18T14:30:00Z',
    defaultSyncWindowMinutes: 60,
  });
  assert.deepStrictEqual(buildDelistPlan(findings), {});
});

test('a listingId is null rather than absent when the platform did not supply one', () => {
  const { findings } = reconcileListings({
    inventory: soldInventory(),
    listings: [{ platform: 'ebay', sku: 'SKU-1', status: 'active', lastWrittenAt: '2026-09-18T16:00:00Z' }],
    now: NOW,
  });
  assert.strictEqual(buildDelistPlan(findings).ebay[0].listingId, null);
});

test('an empty findings array produces an empty plan and an empty summary', () => {
  assert.deepStrictEqual(buildDelistPlan([]), {});
  assert.deepStrictEqual(summarizeByPlatform([]), {});
});

console.log(`\n${passed}/40 passing`);
