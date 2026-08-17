'use strict';
const assert = require('assert');
const { fnv1a, generateEventId, validateDedupPair, mapConsentToChannels } = require('./designer.js');

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

test('fnv1a is deterministic for the same input', () => {
  assert.strictEqual(fnv1a('abc'), fnv1a('abc'));
});

test('fnv1a produces different hashes for different inputs', () => {
  assert.notStrictEqual(fnv1a('abc'), fnv1a('abd'));
});

// --- generateEventId ---
test('throws on missing orderId', () => {
  assert.throws(() => generateEventId('', 'Purchase', Date.parse('2026-08-10')));
});

test('throws on invalid timestampMs', () => {
  assert.throws(() => generateEventId('order-1', 'Purchase', -1));
});

test('generateEventId is deterministic for identical inputs (client and server compute the same ID independently)', () => {
  const ts = Date.parse('2026-08-10T12:00:05Z');
  const id1 = generateEventId('order-123', 'Purchase', ts);
  const id2 = generateEventId('order-123', 'Purchase', ts);
  assert.strictEqual(id1, id2);
});

test('generateEventId is stable across small timestamp drift within the same bucket', () => {
  const id1 = generateEventId('order-123', 'Purchase', Date.parse('2026-08-10T12:00:05Z'), 60);
  const id2 = generateEventId('order-123', 'Purchase', Date.parse('2026-08-10T12:00:45Z'), 60);
  assert.strictEqual(id1, id2); // both fall in the same 60s bucket
});

test('generateEventId differs across bucket boundaries', () => {
  const id1 = generateEventId('order-123', 'Purchase', Date.parse('2026-08-10T12:00:05Z'), 60);
  const id2 = generateEventId('order-123', 'Purchase', Date.parse('2026-08-10T12:02:05Z'), 60);
  assert.notStrictEqual(id1, id2);
});

test('generateEventId differs for different orderIds', () => {
  const ts = Date.parse('2026-08-10T12:00:00Z');
  const id1 = generateEventId('order-1', 'Purchase', ts);
  const id2 = generateEventId('order-2', 'Purchase', ts);
  assert.notStrictEqual(id1, id2);
});

// --- validateDedupPair ---
test('throws when either event is missing', () => {
  assert.throws(() => validateDedupPair(null, {}));
});

test('a matching client/server pair validates cleanly', () => {
  const ts = Date.parse('2026-08-10T12:00:00Z');
  const client = { eventId: 'abc123', eventName: 'Purchase', timestampMs: ts };
  const server = { eventId: 'abc123', eventName: 'Purchase', timestampMs: ts + 2000 };
  const result = validateDedupPair(client, server);
  assert.strictEqual(result.willDedup, true);
});

test('flags a real event_id mismatch', () => {
  const ts = Date.parse('2026-08-10T12:00:00Z');
  const client = { eventId: 'abc123', eventName: 'Purchase', timestampMs: ts };
  const server = { eventId: 'xyz789', eventName: 'Purchase', timestampMs: ts };
  const result = validateDedupPair(client, server);
  assert.strictEqual(result.willDedup, false);
  assert.ok(result.issues.some((i) => i.includes('event_id mismatch')));
});

test('flags a pair whose timestamps exceed the dedup window', () => {
  const clientTs = Date.parse('2026-08-10T00:00:00Z');
  const serverTs = Date.parse('2026-08-10T12:00:00Z'); // 12h apart, exceeds the 6h window
  const client = { eventId: 'abc123', eventName: 'Purchase', timestampMs: clientTs };
  const server = { eventId: 'abc123', eventName: 'Purchase', timestampMs: serverTs };
  const result = validateDedupPair(client, server);
  assert.strictEqual(result.willDedup, false);
});

// --- mapConsentToChannels ---
test('throws on non-object consentSignals', () => {
  assert.throws(() => mapConsentToChannels(null));
});

test('throws on an unknown channel name', () => {
  assert.throws(() => mapConsentToChannels({ ad_storage: true }, ['unknown_channel']));
});

test('full consent makes all channels eligible', () => {
  const result = mapConsentToChannels({ ad_storage: true, analytics_storage: true });
  assert.strictEqual(result.blocked.length, 0);
  assert.strictEqual(result.eligible.length, 4);
});

test('denying ad_storage blocks ad-consent-required channels but not analytics-only ones', () => {
  const result = mapConsentToChannels({ ad_storage: false, analytics_storage: true });
  assert.ok(result.eligible.includes('ga4_measurement_protocol'));
  assert.ok(!result.eligible.includes('meta_capi'));
  const metaBlock = result.blocked.find((b) => b.channel === 'meta_capi');
  assert.deepStrictEqual(metaBlock.missingConsent, ['ad_storage']);
});

test('no consent at all blocks every channel', () => {
  const result = mapConsentToChannels({});
  assert.strictEqual(result.eligible.length, 0);
  assert.strictEqual(result.blocked.length, 4);
});

console.log(`\n${passed}/17 passing`);
