'use strict';
const assert = require('assert');
const { PLATFORM_PROFILES, CAUSES, diagnoseIncident, runRootCauseAnalysis, wasScannerUp } = require('./pipeline.js');

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

const SOLD = '2026-09-19T03:00:00Z';
const NOW = '2026-09-20T00:00:00Z';
const UP = [{ from: '2026-09-19T13:00:00Z', to: '2026-09-20T00:00:00Z' }]; // machine awake in the daytime only

function causeFor(diag, platform) {
  return diag.perPlatform.find((p) => p.platform === platform).cause;
}

// --- profile integrity ---
test('every profile declares a transport, action, and poll interval', () => {
  for (const [name, p] of Object.entries(PLATFORM_PROFILES)) {
    assert.ok(['server', 'extension'].includes(p.detection), `${name} transport`);
    assert.ok(['delist', 'decrement', 'relist', 'none'].includes(p.delistAction), `${name} action`);
    assert.ok(Number.isFinite(p.pollMinutes) && p.pollMinutes > 0, `${name} pollMinutes`);
  }
});

test('every cause maps to a known stage, severity, and fix', () => {
  for (const [name, c] of Object.entries(CAUSES)) {
    assert.ok(['detect', 'dispatch', 'publish'].includes(c.stage), `${name} stage`);
    assert.ok(['critical', 'high', 'medium', 'low'].includes(c.severity), `${name} severity`);
    assert.ok(typeof c.fix === 'string' && c.fix.length > 20, `${name} fix`);
  }
});

test('every cause the engine can emit exists in CAUSES', () => {
  const emitted = [
    'detection_missed_offline', 'detection_unsupported_platform', 'detection_never_fired',
    'listing_not_linked', 'multi_quantity_no_delist', 'blocked_by_active_offer',
    'dispatch_failed', 'relist_after_sale', 'dispatch_pending',
  ];
  for (const c of emitted) assert.ok(CAUSES[c], `${c} missing from CAUSES`);
  assert.strictEqual(Object.keys(CAUSES).length, emitted.length);
});

// --- wasScannerUp ---
test('reports up, down, and unknown correctly', () => {
  assert.strictEqual(wasScannerUp(Date.parse('2026-09-19T14:00:00Z'), UP), 'up');
  assert.strictEqual(wasScannerUp(Date.parse('2026-09-19T03:00:00Z'), UP), 'down');
  assert.strictEqual(wasScannerUp(Date.parse('2026-09-19T03:00:00Z'), []), 'unknown');
  assert.strictEqual(wasScannerUp(Date.parse('2026-09-19T03:00:00Z'), undefined), 'unknown');
});

test('uptime window boundaries are inclusive', () => {
  assert.strictEqual(wasScannerUp(Date.parse('2026-09-19T13:00:00Z'), UP), 'up');
  assert.strictEqual(wasScannerUp(Date.parse('2026-09-20T00:00:00Z'), UP), 'up');
});

test('throws on a backwards uptime window', () => {
  assert.throws(
    () => wasScannerUp(Date.parse(SOLD), [{ from: NOW, to: SOLD }]),
    /ends before it starts/
  );
});

// --- detect stage ---
test('an overnight extension-detected sale is attributed to the scanner being down', () => {
  const d = diagnoseIncident(
    { item: 'Star Wars comic packs', salePlatform: 'poshmark', soldAt: SOLD, detectedAt: null, stuckOn: ['ebay', 'depop', 'mercari'] },
    { uptimeWindows: UP, now: NOW }
  );
  assert.strictEqual(d.detection.cause, 'detection_missed_offline');
  assert.strictEqual(d.detection.transport, 'extension');
  assert.strictEqual(d.detection.scannerUpAtSale, 'down');
});

test('an undetected sale blames the detect stage on every downstream platform', () => {
  const d = diagnoseIncident(
    { item: 'Star Wars comic packs', salePlatform: 'poshmark', soldAt: SOLD, detectedAt: null, stuckOn: ['ebay', 'depop'] },
    { uptimeWindows: UP, now: NOW }
  );
  assert.deepStrictEqual(d.perPlatform.map((p) => p.stage), ['detect', 'detect']);
  assert.ok(d.perPlatform.every((p) => p.cause === 'detection_missed_offline'));
});

test('a missed sale while the scanner WAS up is a connection fault, not an uptime one', () => {
  const d = diagnoseIncident(
    { item: 'Pixar blimp', salePlatform: 'poshmark', soldAt: '2026-09-19T14:00:00Z', detectedAt: null, stuckOn: ['depop'] },
    { uptimeWindows: UP, now: NOW }
  );
  assert.strictEqual(d.detection.cause, 'detection_never_fired');
});

test('a server-detected sale is never blamed on machine uptime', () => {
  const d = diagnoseIncident(
    { item: 'BTTF Hot Wheels', salePlatform: 'ebay', soldAt: SOLD, detectedAt: null, stuckOn: ['poshmark'] },
    { uptimeWindows: UP, now: NOW }
  );
  assert.strictEqual(d.detection.cause, 'detection_never_fired');
});

test('a sale on a platform with no detection support is named as such', () => {
  const d = diagnoseIncident(
    { item: 'Micro Machines', salePlatform: 'vinted', soldAt: SOLD, detectedAt: null, stuckOn: ['ebay'] },
    { uptimeWindows: UP, now: NOW }
  );
  assert.strictEqual(d.detection.cause, 'detection_unsupported_platform');
});

test('a detected sale leaves the detect stage clean', () => {
  const d = diagnoseIncident(
    { item: 'Punisher figure', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, stuckOn: ['poshmark'] },
    { now: NOW }
  );
  assert.strictEqual(d.detection.cause, null);
  assert.notStrictEqual(causeFor(d, 'poshmark'), 'detection_never_fired');
});

// --- dispatch stage ---
test('quantity > 1 blocks delisting on quantity-aware platforms', () => {
  const d = diagnoseIncident(
    { item: 'Punisher figure', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, quantity: 2, stuckOn: ['poshmark', 'depop', 'whatnot'] },
    { now: NOW }
  );
  assert.ok(d.perPlatform.every((p) => p.cause === 'multi_quantity_no_delist'));
  assert.ok(d.perPlatform.every((p) => p.stage === 'dispatch'));
});

test('quantity 1 does not trigger the multi-quantity cause', () => {
  const d = diagnoseIncident(
    { item: 'Punisher figure', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, quantity: 1, stuckOn: ['poshmark'] },
    { now: NOW }
  );
  assert.strictEqual(causeFor(d, 'poshmark'), 'dispatch_failed');
});

test('an active offer blocks deletion only where the platform enforces it', () => {
  const d = diagnoseIncident(
    { item: 'Pixar blimp', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, activeOfferOn: ['poshmark', 'depop'], stuckOn: ['poshmark', 'depop'] },
    { now: NOW }
  );
  assert.strictEqual(causeFor(d, 'poshmark'), 'blocked_by_active_offer'); // poshmark blocks
  assert.strictEqual(causeFor(d, 'depop'), 'dispatch_failed');            // depop does not
});

test('an unlinked listing outranks quantity and offer causes', () => {
  const d = diagnoseIncident(
    { item: 'Micro Machines', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, quantity: 3, notLinkedOn: ['whatnot'], activeOfferOn: ['whatnot'], stuckOn: ['whatnot'] },
    { now: NOW }
  );
  assert.strictEqual(causeFor(d, 'whatnot'), 'listing_not_linked');
});

test('a still-live listing inside the poll window is pending, not failed', () => {
  const d = diagnoseIncident(
    { item: 'Punisher figure', salePlatform: 'ebay', soldAt: '2026-09-19T23:55:00Z', detectedAt: '2026-09-19T23:55:00Z', stuckOn: ['poshmark'] },
    { now: NOW }
  );
  assert.strictEqual(causeFor(d, 'poshmark'), 'dispatch_pending');
  assert.strictEqual(d.perPlatform[0].severity, 'low');
});

test('past the poll window the same listing is a dispatch failure', () => {
  const d = diagnoseIncident(
    { item: 'Punisher figure', salePlatform: 'ebay', soldAt: '2026-09-19T23:00:00Z', detectedAt: '2026-09-19T23:00:00Z', stuckOn: ['poshmark'] },
    { now: NOW }
  );
  assert.strictEqual(causeFor(d, 'poshmark'), 'dispatch_failed');
});

// --- publish stage ---
test('a repost is attributed to the publish stage even when detection worked', () => {
  const d = diagnoseIncident(
    { item: 'Micro Machines', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, repostedOn: ['mercari'], stuckOn: ['mercari'] },
    { now: NOW }
  );
  assert.strictEqual(causeFor(d, 'mercari'), 'relist_after_sale');
  assert.strictEqual(d.perPlatform[0].stage, 'publish');
});

test('a repost outranks an undetected sale, because the relister ran regardless', () => {
  const d = diagnoseIncident(
    { item: 'Micro Machines', salePlatform: 'poshmark', soldAt: SOLD, detectedAt: null, repostedOn: ['mercari'], stuckOn: ['mercari', 'depop'] },
    { uptimeWindows: UP, now: NOW }
  );
  assert.strictEqual(causeFor(d, 'mercari'), 'relist_after_sale');
  assert.strictEqual(causeFor(d, 'depop'), 'detection_missed_offline');
});

// --- validation ---
test('rejects an unknown platform rather than guessing its behavior', () => {
  assert.throws(
    () => diagnoseIncident({ item: 'X', salePlatform: 'kijiji', soldAt: SOLD, stuckOn: [] }, { now: NOW }),
    /Unknown platform "kijiji"/
  );
});

test('accepts an unknown platform once a profile is supplied', () => {
  const d = diagnoseIncident(
    { item: 'X', salePlatform: 'kijiji', soldAt: SOLD, detectedAt: SOLD, stuckOn: ['kijiji'] },
    { now: NOW, profiles: { kijiji: { detection: 'extension', pollMinutes: 10, delistAction: 'delist', blocksDeleteWithOffer: false } } }
  );
  assert.strictEqual(causeFor(d, 'kijiji'), 'dispatch_failed');
});

test('rejects a timezone-ambiguous soldAt', () => {
  assert.throws(
    () => diagnoseIncident({ item: 'X', salePlatform: 'ebay', soldAt: '2026-09-19 03:00:00', stuckOn: [] }, { now: NOW }),
    /not timezone-explicit/
  );
});

test('rejects a sale timestamped in the future', () => {
  assert.throws(
    () => diagnoseIncident({ item: 'X', salePlatform: 'ebay', soldAt: '2026-09-21T00:00:00Z', stuckOn: [] }, { now: NOW }),
    /sold in the future/
  );
});

test('rejects a non-integer or zero quantity', () => {
  assert.throws(
    () => diagnoseIncident({ item: 'X', salePlatform: 'ebay', soldAt: SOLD, quantity: 0, stuckOn: [] }, { now: NOW }),
    /integer quantity/
  );
});

test('rejects an incident with no item name or no stuckOn array', () => {
  assert.throws(() => diagnoseIncident({ salePlatform: 'ebay', soldAt: SOLD, stuckOn: [] }, { now: NOW }), /non-empty item name/);
  assert.throws(() => diagnoseIncident({ item: 'X', salePlatform: 'ebay', soldAt: SOLD }, { now: NOW }), /stuckOn as an array/);
});

test('platform names are case- and whitespace-insensitive', () => {
  const d = diagnoseIncident(
    { item: 'X', salePlatform: '  EBAY ', soldAt: SOLD, detectedAt: SOLD, stuckOn: ['PoshMark'] },
    { now: NOW }
  );
  assert.strictEqual(d.salePlatform, 'ebay');
  assert.strictEqual(d.perPlatform[0].platform, 'poshmark');
});

// --- aggregate RCA ---
test('ranks causes by how many stuck listings each explains', () => {
  const { ranked, stageShare } = runRootCauseAnalysis(
    [
      { item: 'A', salePlatform: 'poshmark', soldAt: SOLD, detectedAt: null, stuckOn: ['ebay', 'depop', 'whatnot'] },
      { item: 'B', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, repostedOn: ['mercari'], stuckOn: ['mercari'] },
    ],
    { uptimeWindows: UP, now: NOW }
  );
  assert.strictEqual(ranked[0].cause, 'detection_missed_offline');
  assert.strictEqual(ranked[0].count, 3);
  assert.strictEqual(ranked[0].share, 75);
  assert.deepStrictEqual(ranked[0].platforms, ['depop', 'ebay', 'whatnot']);
  assert.strictEqual(ranked[1].cause, 'relist_after_sale');
  assert.deepStrictEqual(stageShare, { detect: 75, publish: 25 });
});

test('a tie on count is broken by severity', () => {
  const { ranked } = runRootCauseAnalysis(
    [
      { item: 'A', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, quantity: 2, stuckOn: ['depop'] },
      { item: 'B', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, activeOfferOn: ['poshmark'], stuckOn: ['poshmark'] },
    ],
    { now: NOW }
  );
  assert.strictEqual(ranked[0].cause, 'multi_quantity_no_delist'); // critical
  assert.strictEqual(ranked[1].cause, 'blocked_by_active_offer');  // high
});

test('shares across all causes sum to 100', () => {
  const { ranked } = runRootCauseAnalysis(
    [
      { item: 'A', salePlatform: 'poshmark', soldAt: SOLD, detectedAt: null, stuckOn: ['ebay', 'depop'] },
      { item: 'B', salePlatform: 'ebay', soldAt: SOLD, detectedAt: SOLD, quantity: 4, stuckOn: ['whatnot', 'depop'] },
    ],
    { uptimeWindows: UP, now: NOW }
  );
  assert.strictEqual(ranked.reduce((s, r) => s + r.share, 0), 100);
});

test('rejects an empty incident list', () => {
  assert.throws(() => runRootCauseAnalysis([], { now: NOW }), /non-empty array/);
});

console.log(`\n${passed}/31 passing`);
