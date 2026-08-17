'use strict';
const assert = require('assert');
const { normalizeIdentifier, mergeSuppressionRecords, buildConsentLedger, computeSyncPlan, SUPPRESSION_PRECEDENCE } = require('./ledger.js');

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

// --- normalizeIdentifier (email) ---
test('lowercases and strips plus-addressing from an email', () => {
  assert.strictEqual(normalizeIdentifier('User+Promo@Example.COM', 'email'), 'user@example.com');
});

test('an email with no plus-addressing normalizes to itself, lowercased', () => {
  assert.strictEqual(normalizeIdentifier('Jane.Doe@Company.io', 'email'), 'jane.doe@company.io');
});

test('does not strip dots (Gmail-only quirk, not applied universally)', () => {
  assert.strictEqual(normalizeIdentifier('jane.doe@company.io', 'email'), 'jane.doe@company.io');
});

test('throws on an email missing "@"', () => {
  assert.throws(() => normalizeIdentifier('not-an-email', 'email'));
});

test('throws on an email with nothing before "@"', () => {
  assert.throws(() => normalizeIdentifier('@example.com', 'email'));
});

// --- normalizeIdentifier (phone) ---
test('normalizes a 10-digit US number to E.164', () => {
  assert.strictEqual(normalizeIdentifier('(555) 123-4567', 'phone'), '+15551234567');
});

test('normalizes an 11-digit US number with leading 1', () => {
  assert.strictEqual(normalizeIdentifier('1-555-123-4567', 'phone'), '+15551234567');
});

test('passes through an already-E.164 international number', () => {
  assert.strictEqual(normalizeIdentifier('+44 20 7123 4567', 'phone'), '+442071234567');
});

test('throws on an ambiguous 7-digit number', () => {
  assert.throws(() => normalizeIdentifier('1234567', 'phone'));
});

test('throws on an unknown identifier type', () => {
  assert.throws(() => normalizeIdentifier('test@example.com', 'fax'));
});

// --- mergeSuppressionRecords ---
test('a single record merges to itself', () => {
  const result = mergeSuppressionRecords([{ source: 'ToolA', reason: 'unsubscribe', suppressedAt: '2026-01-01' }]);
  assert.strictEqual(result.reason, 'unsubscribe');
  assert.strictEqual(result.since, '2026-01-01');
});

test('the more severe reason wins across sources', () => {
  const result = mergeSuppressionRecords([
    { source: 'ToolA', reason: 'unsubscribe', suppressedAt: '2026-01-01' },
    { source: 'ToolB', reason: 'gdpr_erasure', suppressedAt: '2026-02-01' },
  ]);
  assert.strictEqual(result.reason, 'gdpr_erasure');
  assert.strictEqual(result.requiresErasureReview, true);
});

test('"since" is always the earliest date, even if it is not the winning reason', () => {
  const result = mergeSuppressionRecords([
    { source: 'ToolA', reason: 'soft_bounce', suppressedAt: '2025-11-01' },
    { source: 'ToolB', reason: 'complaint', suppressedAt: '2026-02-01' },
  ]);
  assert.strictEqual(result.reason, 'complaint');
  assert.strictEqual(result.since, '2025-11-01');
});

test('a precedence tie breaks toward the earliest timestamp', () => {
  const result = mergeSuppressionRecords([
    { source: 'ToolA', reason: 'manual_dnc', suppressedAt: '2026-03-01' },
    { source: 'ToolB', reason: 'complaint', suppressedAt: '2026-01-15' },
  ]);
  // manual_dnc and complaint are both precedence 3 -- earlier timestamp wins
  assert.strictEqual(result.reason, 'complaint');
});

test('sources list is deduped', () => {
  const result = mergeSuppressionRecords([
    { source: 'ToolA', reason: 'unsubscribe', suppressedAt: '2026-01-01' },
    { source: 'ToolA', reason: 'hard_bounce', suppressedAt: '2026-01-02' },
  ]);
  assert.deepStrictEqual(result.sources, ['ToolA']);
});

test('requiresErasureReview is false when no gdpr_erasure record is present', () => {
  const result = mergeSuppressionRecords([{ source: 'ToolA', reason: 'hard_bounce', suppressedAt: '2026-01-01' }]);
  assert.strictEqual(result.requiresErasureReview, false);
});

test('throws on an unknown suppression reason', () => {
  assert.throws(() => mergeSuppressionRecords([{ source: 'ToolA', reason: 'annoyed', suppressedAt: '2026-01-01' }]));
});

test('throws on an empty records array', () => {
  assert.throws(() => mergeSuppressionRecords([]));
});

// --- buildConsentLedger ---
test('merges the same contact across tools despite different identifier formatting', () => {
  const result = buildConsentLedger({
    ToolA: [{ identifier: 'Jane+Sales@Company.com', type: 'email', reason: 'unsubscribe', suppressedAt: '2026-01-01' }],
    ToolB: [{ identifier: 'jane@company.com', type: 'email', reason: 'hard_bounce', suppressedAt: '2026-01-05' }],
  });
  const keys = Object.keys(result.ledger);
  assert.strictEqual(keys.length, 1);
  assert.strictEqual(keys[0], 'jane@company.com');
});

test('flags a real gap: suppressed in one tool, not suppressed in another', () => {
  const result = buildConsentLedger({
    ToolA: [{ identifier: 'gap@company.com', type: 'email', reason: 'complaint', suppressedAt: '2026-01-01' }],
    ToolB: [],
  });
  assert.strictEqual(result.gaps.length, 1);
  assert.strictEqual(result.gaps[0].missingFrom.includes('ToolB'), true);
});

test('a contact suppressed in every connected tool produces no gap', () => {
  const result = buildConsentLedger({
    ToolA: [{ identifier: 'clean@company.com', type: 'email', reason: 'unsubscribe', suppressedAt: '2026-01-01' }],
    ToolB: [{ identifier: 'clean@company.com', type: 'email', reason: 'unsubscribe', suppressedAt: '2026-01-01' }],
  });
  assert.strictEqual(result.gaps.length, 0);
});

test('phone and email identifiers for different contacts stay separate', () => {
  const result = buildConsentLedger({
    ToolA: [
      { identifier: 'test@company.com', type: 'email', reason: 'unsubscribe', suppressedAt: '2026-01-01' },
      { identifier: '555-123-4567', type: 'phone', reason: 'manual_dnc', suppressedAt: '2026-01-01' },
    ],
  });
  assert.strictEqual(Object.keys(result.ledger).length, 2);
});

test('throws when toolExports is empty', () => {
  assert.throws(() => buildConsentLedger({}));
});

test('throws when a tool export is not an array', () => {
  assert.throws(() => buildConsentLedger({ ToolA: 'not-an-array' }));
});

// --- computeSyncPlan ---
test('builds a per-tool push list from gaps', () => {
  const { gaps } = buildConsentLedger({
    ToolA: [{ identifier: 'gap@company.com', type: 'email', reason: 'complaint', suppressedAt: '2026-01-01' }],
    ToolB: [],
    ToolC: [],
  });
  const plan = computeSyncPlan(gaps);
  assert.strictEqual(plan.ToolB.length, 1);
  assert.strictEqual(plan.ToolC.length, 1);
  assert.strictEqual(plan.ToolB[0].identifier, 'gap@company.com');
  assert.strictEqual(plan.ToolB[0].reason, 'complaint');
  assert.strictEqual(plan.ToolA, undefined);
});

test('an empty gaps array produces an empty plan', () => {
  assert.deepStrictEqual(computeSyncPlan([]), {});
});

test('SUPPRESSION_PRECEDENCE covers all six documented reasons', () => {
  assert.deepStrictEqual(
    Object.keys(SUPPRESSION_PRECEDENCE).sort(),
    ['complaint', 'gdpr_erasure', 'hard_bounce', 'manual_dnc', 'soft_bounce', 'unsubscribe']
  );
});

console.log(`\n${passed}/27 passing`);
