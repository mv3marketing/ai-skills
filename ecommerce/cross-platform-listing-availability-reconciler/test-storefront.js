'use strict';
const assert = require('assert');
const {
  validateSnapshot, diffSnapshots, confirmDisappearances, reconcileWithLedger, buildStorefrontReport,
} = require('./storefront.js');

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS: ${name}`); passed++; }
  catch (e) { console.log(`FAIL: ${name} -> ${e.message}`); process.exitCode = 1; }
}

const T = (n) => `2026-09-20T0${n}:00:00Z`;
const snap = (t, ids, extra = {}) => ({
  platform: 'poshmark',
  fetchedAt: T(t),
  complete: true,
  items: ids.map((id) => ({ listingId: id, title: `Item ${id}` })),
  ...extra,
});

// --- validateSnapshot ---
test('normalizes platform case and indexes items by listingId', () => {
  const s = validateSnapshot({ platform: ' PoshMark ', fetchedAt: T(1), complete: true, items: [{ listingId: 'a' }] });
  assert.strictEqual(s.platform, 'poshmark');
  assert.ok(s.items.has('a'));
});

test('refuses a snapshot that does not state completeness', () => {
  assert.throws(
    () => validateSnapshot({ platform: 'poshmark', fetchedAt: T(1), items: [] }),
    /must state complete/
  );
});

test('refuses duplicate listing ids in one snapshot', () => {
  assert.throws(
    () => validateSnapshot({ platform: 'p', fetchedAt: T(1), complete: true, items: [{ listingId: 'a' }, { listingId: 'a' }] }),
    /Duplicate listingId/
  );
});

test('refuses an item with no listingId and a bad expectedTotal', () => {
  assert.throws(() => validateSnapshot({ platform: 'p', fetchedAt: T(1), complete: true, items: [{ title: 'x' }] }), /non-empty string listingId/);
  assert.throws(() => validateSnapshot({ platform: 'p', fetchedAt: T(1), complete: true, items: [], expectedTotal: -1 }), /non-integer expectedTotal/);
});

test('rejects a timezone-ambiguous fetchedAt', () => {
  assert.throws(
    () => validateSnapshot({ platform: 'p', fetchedAt: '2026-09-20 01:00:00', complete: true, items: [] }),
    /not timezone-explicit/
  );
});

// --- diffSnapshots ---
test('reports appeared, persisted and disappeared', () => {
  const d = diffSnapshots(snap(1, ['a', 'b']), snap(2, ['b', 'c']));
  assert.deepStrictEqual(d.appeared.map((i) => i.listingId), ['c']);
  assert.deepStrictEqual(d.persisted.map((i) => i.listingId), ['b']);
  assert.deepStrictEqual(d.disappeared.map((i) => i.listingId), ['a']);
  assert.strictEqual(d.trusted, true);
});

test('suppresses ALL disappearances when the current snapshot is incomplete', () => {
  const d = diffSnapshots(snap(1, ['a', 'b', 'c', 'd', 'e']), snap(2, ['a', 'b', 'c', 'd'], { complete: false }));
  assert.deepStrictEqual(d.disappeared, []);
  assert.strictEqual(d.suppressedDisappearances, 1);
  assert.strictEqual(d.trusted, false);
  assert.strictEqual(d.untrustedReason, 'current_snapshot_incomplete');
});

test('suppresses disappearances when the PREVIOUS snapshot was incomplete', () => {
  const d = diffSnapshots(snap(1, ['a', 'b'], { complete: false }), snap(2, ['a']));
  assert.strictEqual(d.trusted, false);
  assert.strictEqual(d.untrustedReason, 'previous_snapshot_incomplete');
});

test('a truncated fetch that loses most of the shop is distrusted, not read as mass sell-through', () => {
  const before = snap(1, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  const truncated = snap(2, ['a', 'b']); // claims complete, but 80% vanished
  const d = diffSnapshots(before, truncated);
  assert.strictEqual(d.trusted, false);
  assert.strictEqual(d.untrustedReason, 'disappearance_rate_above_threshold');
  assert.strictEqual(d.suppressedDisappearances, 8);
  assert.deepStrictEqual(d.disappeared, []);
  assert.match(d.detail, /truncated fetch/);
});

test('a normal sell-through rate stays trusted', () => {
  const before = snap(1, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  const after = snap(2, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']); // 10%
  const d = diffSnapshots(before, after);
  assert.strictEqual(d.trusted, true);
  assert.deepStrictEqual(d.disappeared.map((i) => i.listingId), ['j']);
});

test('the disappearance threshold is configurable', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `i${i}`);
  const before = snap(1, ids);
  const after = snap(2, ids.slice(0, 10)); // 50%, well above the absolute floor
  assert.strictEqual(diffSnapshots(before, after, { maxDisappearanceRatio: 0.6 }).trusted, true);
  assert.strictEqual(diffSnapshots(before, after, { maxDisappearanceRatio: 0.4 }).trusted, false);
});

test('ordinary sell-through on a small shop is trusted despite a high ratio', () => {
  // 1 of 3 sold is 33%, far above the 20% ratio, but only one listing moved.
  const d = diffSnapshots(snap(1, ['a', 'b', 'c']), snap(2, ['a', 'b']));
  assert.strictEqual(d.trusted, true);
  assert.deepStrictEqual(d.disappeared.map((i) => i.listingId), ['c']);
});

test('the absolute floor is configurable and can be disabled', () => {
  const before = snap(1, ['a', 'b', 'c']);
  const after = snap(2, ['a', 'b']);
  assert.strictEqual(diffSnapshots(before, after, { minDisappearancesForRatioGuard: 0 }).trusted, false);
  assert.throws(() => diffSnapshots(before, after, { minDisappearancesForRatioGuard: -1 }), /non-negative integer/);
});

test('a page whose own total disagrees with the items parsed is distrusted', () => {
  const d = diffSnapshots(snap(1, ['a', 'b']), snap(2, ['a', 'b'], { expectedTotal: 5 }));
  assert.strictEqual(d.trusted, false);
  assert.strictEqual(d.untrustedReason, 'item_count_disagrees_with_page_total');
});

test('a matching page total keeps the snapshot trusted', () => {
  const d = diffSnapshots(snap(1, ['a', 'b']), snap(2, ['a'], { expectedTotal: 1 }));
  assert.strictEqual(d.trusted, true);
});

test('an empty previous storefront never trips the ratio guard', () => {
  const d = diffSnapshots(snap(1, []), snap(2, ['a']));
  assert.strictEqual(d.trusted, true);
  assert.deepStrictEqual(d.appeared.map((i) => i.listingId), ['a']);
});

test('refuses to diff across platforms or backwards in time', () => {
  assert.throws(() => diffSnapshots(snap(1, ['a']), { ...snap(2, ['a']), platform: 'depop' }), /different platforms/);
  assert.throws(() => diffSnapshots(snap(3, ['a']), snap(1, ['a'])), /out of order/);
});

test('rejects an out-of-range ratio', () => {
  assert.throws(() => diffSnapshots(snap(1, ['a']), snap(2, ['a']), { maxDisappearanceRatio: 2 }), /between 0 and 1/);
});

// --- confirmDisappearances ---
test('one absence is pending, not a sale signal', () => {
  const r = confirmDisappearances([snap(1, ['a', 'b']), snap(2, ['a'])]);
  assert.deepStrictEqual(r.confirmed, []);
  assert.deepStrictEqual(r.pending.map((i) => i.listingId), ['b']);
});

test('two consecutive absences confirm the sale signal', () => {
  const r = confirmDisappearances([snap(1, ['a', 'b']), snap(2, ['a']), snap(3, ['a'])]);
  assert.deepStrictEqual(r.confirmed.map((i) => i.listingId), ['b']);
  assert.strictEqual(r.confirmed[0].absentFor, 2);
  assert.strictEqual(r.confirmed[0].platform, 'poshmark');
});

test('an item that reappears is not reported as sold', () => {
  const r = confirmDisappearances([snap(1, ['a', 'b']), snap(2, ['a']), snap(3, ['a', 'b'])]);
  assert.deepStrictEqual(r.confirmed, []);
  assert.deepStrictEqual(r.pending, []);
});

test('confirmations is configurable', () => {
  const snaps = [snap(1, ['a', 'b']), snap(2, ['a']), snap(3, ['a'])];
  assert.strictEqual(confirmDisappearances(snaps, { confirmations: 3 }).confirmed.length, 0);
  assert.strictEqual(confirmDisappearances(snaps, { confirmations: 1 }).confirmed.length, 1);
});

test('an untrusted poll breaks the confirmation chain instead of extending it', () => {
  const r = confirmDisappearances([
    snap(1, ['a', 'b']),
    snap(2, ['a']),
    snap(3, ['a'], { complete: false }),
  ]);
  assert.deepStrictEqual(r.confirmed, []);
  assert.strictEqual(r.untrusted.length, 1);
  assert.strictEqual(r.trustedDiffs, 1);
});

test('needs at least two snapshots and a positive confirmations value', () => {
  assert.throws(() => confirmDisappearances([snap(1, ['a'])]), /at least two snapshots/);
  assert.throws(() => confirmDisappearances([snap(1, ['a']), snap(2, [])], { confirmations: 0 }), /positive integer/);
});

// --- reconcileWithLedger ---
const ledger = [
  { sku: 'SKU-SOLD', status: 'sold', listings: [{ platform: 'poshmark', listingId: 'sold-1' }] },
  { sku: 'SKU-LIVE', status: 'available', listings: [{ platform: 'poshmark', listingId: 'live-1' }] },
];

test('flags a listing the ledger says is sold but the storefront still shows', () => {
  const r = reconcileWithLedger(snap(1, ['sold-1', 'live-1']), ledger);
  assert.deepStrictEqual(r.shouldBeGone.map((i) => i.sku), ['SKU-SOLD']);
  assert.strictEqual(r.shouldBeGone[0].ledgerStatus, 'sold');
  assert.strictEqual(r.ok, 1);
});

test('flags a live listing the ledger has never heard of as an orphan', () => {
  const r = reconcileWithLedger(snap(1, ['live-1', 'eys-legacy-9']), ledger);
  assert.deepStrictEqual(r.orphans.map((i) => i.listingId), ['eys-legacy-9']);
});

test('an ended ledger status counts the same as sold', () => {
  const r = reconcileWithLedger(snap(1, ['x']), [{ sku: 'S', status: 'archived', listings: [{ platform: 'poshmark', listingId: 'x' }] }]);
  assert.strictEqual(r.shouldBeGone.length, 1);
});

test('ledger listing ids are matched per platform, not globally', () => {
  const r = reconcileWithLedger(snap(1, ['dup']), [{ sku: 'S', status: 'sold', listings: [{ platform: 'depop', listingId: 'dup' }] }]);
  assert.strictEqual(r.orphans.length, 1); // same id, different platform -> not a match
  assert.strictEqual(r.shouldBeGone.length, 0);
});

test('a presence-based reconcile still works on an incomplete snapshot', () => {
  const r = reconcileWithLedger({ ...snap(1, ['sold-1']), complete: false }, ledger);
  assert.strictEqual(r.shouldBeGone.length, 1);
});

test('rejects a malformed ledger', () => {
  assert.throws(() => reconcileWithLedger(snap(1, []), [{ status: 'sold' }]), /non-empty string sku/);
  assert.throws(() => reconcileWithLedger(snap(1, []), [{ sku: 'S', status: 'sold', listings: [{ platform: 'p' }] }]), /platform and listingId/);
});

// --- buildStorefrontReport ---
test('rolls every platform up and flags what needs attention', () => {
  const report = buildStorefrontReport({
    snapshotsByPlatform: {
      poshmark: [snap(1, ['sold-1', 'live-1', 'gone-1']), snap(2, ['sold-1', 'live-1']), snap(3, ['sold-1', 'live-1'])],
      depop: [{ platform: 'depop', fetchedAt: T(3), complete: true, items: [{ listingId: 'orphan-d' }] }],
    },
    ledger,
  });
  assert.deepStrictEqual(report.byPlatform.poshmark.saleSignals.map((i) => i.listingId), ['gone-1']);
  assert.strictEqual(report.byPlatform.poshmark.shouldBeGone.length, 1);
  assert.strictEqual(report.byPlatform.depop.orphans.length, 1);
  assert.strictEqual(report.totals.saleSignals, 1);
  // gone-1 left the storefront, so it is no longer live anywhere — only depop's orphan remains.
  assert.strictEqual(report.totals.orphans, 1);
  assert.strictEqual(report.needsAttention, true);
});

test('a single snapshot yields ledger findings but no sale signals', () => {
  const report = buildStorefrontReport({ snapshotsByPlatform: { poshmark: [snap(1, ['live-1'])] }, ledger });
  assert.deepStrictEqual(report.byPlatform.poshmark.saleSignals, []);
  assert.strictEqual(report.byPlatform.poshmark.liveAndCorrect, 1);
  assert.strictEqual(report.needsAttention, false);
});

test('untrusted polls surface in the totals and force attention', () => {
  const report = buildStorefrontReport({
    snapshotsByPlatform: { poshmark: [snap(1, ['live-1', 'a', 'b', 'c', 'd', 'e']), snap(2, ['live-1'])] },
    ledger,
  });
  assert.strictEqual(report.totals.untrustedPolls, 1);
  assert.strictEqual(report.totals.saleSignals, 0);
  assert.strictEqual(report.needsAttention, true);
});

test('rejects an empty snapshot list for a platform', () => {
  assert.throws(() => buildStorefrontReport({ snapshotsByPlatform: { poshmark: [] }, ledger }), /non-empty array/);
});

console.log(`\n${passed}/34 passing`);
