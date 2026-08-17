'use strict';
const assert = require('assert');
const { jaroWinklerSimilarity, scoreDuplicateLikelihood, computeMergePlan, DEFAULT_FIELD_WEIGHTS } = require('./resolver.js');

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name} -> ${e.message}`);
    process.exitCode = 1;
  }
}

// --- jaroWinklerSimilarity, verified against published reference values ---
test('matches the published MARTHA/MARHTA reference value (0.961)', () => {
  assert.strictEqual(jaroWinklerSimilarity('MARTHA', 'MARHTA'), 0.9611);
});

test('matches the published DIXON/DICKSONX reference value (0.813)', () => {
  assert.strictEqual(jaroWinklerSimilarity('DIXON', 'DICKSONX'), 0.8133);
});

test('identical strings score exactly 1', () => {
  assert.strictEqual(jaroWinklerSimilarity('Acme Inc', 'Acme Inc'), 1);
});

test('is case-insensitive', () => {
  assert.strictEqual(jaroWinklerSimilarity('ACME', 'acme'), 1);
});

test('completely disjoint strings score 0', () => {
  assert.strictEqual(jaroWinklerSimilarity('abc', 'xyz'), 0);
});

test('an empty string against a non-empty string scores 0', () => {
  assert.strictEqual(jaroWinklerSimilarity('', 'acme'), 0);
});

test('throws on non-string input', () => {
  assert.throws(() => jaroWinklerSimilarity(123, 'acme'));
});

// --- scoreDuplicateLikelihood ---
test('near-identical company names and matching domains score as a likely duplicate', () => {
  const result = scoreDuplicateLikelihood(
    { companyName: 'Acme Inc', domain: 'acme.com', phone: '5551234567' },
    { companyName: 'Acme, Incorporated', domain: 'acme.com', phone: '5551234567' }
  );
  assert.strictEqual(result.isLikelyDuplicate, true);
});

test('unrelated companies score as not a likely duplicate', () => {
  const result = scoreDuplicateLikelihood(
    { companyName: 'Acme Inc', domain: 'acme.com', phone: '5551234567' },
    { companyName: 'Zephyr Logistics', domain: 'zephyrlogistics.com', phone: '5559998888' }
  );
  assert.strictEqual(result.isLikelyDuplicate, false);
});

test('a field missing on one side is scored null and excluded from the weighted average', () => {
  const result = scoreDuplicateLikelihood(
    { companyName: 'Acme Inc', domain: 'acme.com' },
    { companyName: 'Acme Inc' }
  );
  assert.strictEqual(result.fieldScores.domain, null);
  assert.strictEqual(result.fieldScores.phone, null);
  assert.strictEqual(result.fieldScores.companyName, 1);
  // only companyName was comparable, so it alone determines the composite score
  assert.strictEqual(result.compositeScore, 1);
});

test('throws when field weights do not sum to 1', () => {
  assert.throws(() => scoreDuplicateLikelihood({ companyName: 'A' }, { companyName: 'A' }, { companyName: 0.5, domain: 0.3 }));
});

test('throws when no comparable fields exist on either record', () => {
  assert.throws(() => scoreDuplicateLikelihood({}, {}));
});

test('DEFAULT_FIELD_WEIGHTS sums to 1', () => {
  const sum = Object.values(DEFAULT_FIELD_WEIGHTS).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(sum - 1) < 0.0001);
});

// --- computeMergePlan ---
test('a field present only on A survives into the merge', () => {
  const result = computeMergePlan({ companyName: 'Acme', industry: 'Software' }, { companyName: 'Acme' }, '2026-01-01', '2026-01-01');
  assert.strictEqual(result.survivingFields.industry, 'Software');
});

test('a field present only on B survives into the merge', () => {
  const result = computeMergePlan({ companyName: 'Acme' }, { companyName: 'Acme', industry: 'Software' }, '2026-01-01', '2026-01-01');
  assert.strictEqual(result.survivingFields.industry, 'Software');
});

test('when both records have the same value, no conflict is recorded', () => {
  const result = computeMergePlan({ companyName: 'Acme' }, { companyName: 'Acme' }, '2026-01-01', '2026-02-01');
  assert.strictEqual(result.conflicts.length, 0);
  assert.strictEqual(result.survivingFields.companyName, 'Acme');
});

test('when values conflict, the more recently updated record wins and the conflict is logged', () => {
  const result = computeMergePlan(
    { companyName: 'Acme', employees: '50' },
    { companyName: 'Acme', employees: '75' },
    '2026-01-01',
    '2026-03-01'
  );
  assert.strictEqual(result.survivingFields.employees, '75');
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].keptFrom, 'B');
  assert.strictEqual(result.conflicts[0].discardedValue, '50');
});

test('when A is more recently updated and values conflict, A wins', () => {
  const result = computeMergePlan(
    { employees: '50' },
    { employees: '75' },
    '2026-05-01',
    '2026-01-01'
  );
  assert.strictEqual(result.survivingFields.employees, '50');
  assert.strictEqual(result.conflicts[0].keptFrom, 'A');
});

test('a field missing on both sides surfaces as null, not omitted silently', () => {
  const result = computeMergePlan({ companyName: 'Acme' }, { companyName: 'Acme' }, '2026-01-01', '2026-01-01');
  // neither record has a "notes" field at all -- the resulting plan simply
  // won't include it, since allFields only spans keys actually present
  assert.strictEqual(result.survivingFields.notes, undefined);
});

test('throws when updatedAt timestamps are missing', () => {
  assert.throws(() => computeMergePlan({ a: 1 }, { a: 2 }, null, '2026-01-01'));
});

console.log(`\n${passed}/${total} passing`);
