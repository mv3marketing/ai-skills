'use strict';
const assert = require('assert');
const { computeKaplanMeierCurve, computeMedianSurvivalTime, compareCohortSurvival } = require('./survival.js');

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

const CLASSIC_EXAMPLE = [
  { customerId: 'A', tenureDays: 5, churned: true },
  { customerId: 'B', tenureDays: 6, churned: true },
  { customerId: 'C', tenureDays: 6, churned: false }, // censored: still active
  { customerId: 'D', tenureDays: 8, churned: true },
];

// --- computeKaplanMeierCurve, hand-verified against the classic example above ---
test('hand-verified: first event time (t=5) atRisk and survival', () => {
  const curve = computeKaplanMeierCurve(CLASSIC_EXAMPLE);
  assert.strictEqual(curve[0].tenureDays, 5);
  assert.strictEqual(curve[0].atRisk, 4);
  assert.strictEqual(curve[0].events, 1);
  assert.strictEqual(curve[0].survivalProbability, 0.75);
});

test('hand-verified: second event time (t=6) correctly excludes the already-churned customer from atRisk', () => {
  const curve = computeKaplanMeierCurve(CLASSIC_EXAMPLE);
  // A already churned at t=5, so atRisk at t=6 is B, C, D = 3, not 4
  assert.strictEqual(curve[1].atRisk, 3);
  assert.strictEqual(curve[1].survivalProbability, 0.5);
});

test('hand-verified: a censored customer (C) is at risk but does not count as an event', () => {
  const curve = computeKaplanMeierCurve(CLASSIC_EXAMPLE);
  // C is censored at t=6, contributes to atRisk at t=6 but not to events
  assert.strictEqual(curve[1].events, 1); // only B, not C
});

test('hand-verified: final event time (t=8) drives survival to exactly 0', () => {
  const curve = computeKaplanMeierCurve(CLASSIC_EXAMPLE);
  assert.strictEqual(curve[2].atRisk, 1);
  assert.strictEqual(curve[2].survivalProbability, 0);
});

test('a cohort with zero churn events produces an empty curve (survival never drops)', () => {
  const noChurn = [
    { customerId: 'X', tenureDays: 30, churned: false },
    { customerId: 'Y', tenureDays: 45, churned: false },
  ];
  const curve = computeKaplanMeierCurve(noChurn);
  assert.strictEqual(curve.length, 0);
});

test('simultaneous churn events at the same tenure day are combined into one curve point', () => {
  const simultaneous = [
    { customerId: 'A', tenureDays: 10, churned: true },
    { customerId: 'B', tenureDays: 10, churned: true },
    { customerId: 'C', tenureDays: 10, churned: false },
  ];
  const curve = computeKaplanMeierCurve(simultaneous);
  assert.strictEqual(curve.length, 1);
  assert.strictEqual(curve[0].events, 2);
  assert.strictEqual(curve[0].atRisk, 3);
  // survival = 1 - 2/3
  approxEqual(curve[0].survivalProbability, 1 / 3);
});

test('throws on an empty customers array', () => {
  assert.throws(() => computeKaplanMeierCurve([]));
});

test('throws when churned is not a boolean', () => {
  assert.throws(() => computeKaplanMeierCurve([{ customerId: 'A', tenureDays: 5, churned: 'yes' }]));
});

test('throws on negative tenureDays', () => {
  assert.throws(() => computeKaplanMeierCurve([{ customerId: 'A', tenureDays: -1, churned: true }]));
});

function approxEqual(a, b, tol = 0.0001) {
  assert.ok(Math.abs(a - b) < tol, `expected ${a} to be within ${tol} of ${b}`);
}

// --- computeMedianSurvivalTime ---
test('hand-verified median survival time from the classic example is t=6 (first point at or below 0.5)', () => {
  const curve = computeKaplanMeierCurve(CLASSIC_EXAMPLE);
  assert.strictEqual(computeMedianSurvivalTime(curve), 6);
});

test('returns null when the curve never reaches 50% survival', () => {
  const highRetention = [
    { customerId: 'A', tenureDays: 100, churned: true },
    { customerId: 'B', tenureDays: 200, churned: false },
    { customerId: 'C', tenureDays: 300, churned: false },
    { customerId: 'D', tenureDays: 400, churned: false },
  ];
  const curve = computeKaplanMeierCurve(highRetention);
  assert.strictEqual(computeMedianSurvivalTime(curve), null);
});

// --- compareCohortSurvival ---
test('splits customers by cohort and computes an independent curve per cohort', () => {
  const customers = [
    { customerId: 'A', cohort: 'enterprise', tenureDays: 5, churned: true },
    { customerId: 'B', cohort: 'enterprise', tenureDays: 6, churned: true },
    { customerId: 'C', cohort: 'enterprise', tenureDays: 6, churned: false },
    { customerId: 'D', cohort: 'enterprise', tenureDays: 8, churned: true },
    { customerId: 'E', cohort: 'smb', tenureDays: 20, churned: false },
    { customerId: 'F', cohort: 'smb', tenureDays: 25, churned: false },
  ];
  const result = compareCohortSurvival(customers);
  assert.strictEqual(result.enterprise.medianSurvivalTime, 6);
  assert.strictEqual(result.enterprise.customerCount, 4);
  assert.strictEqual(result.smb.medianSurvivalTime, null);
  assert.strictEqual(result.smb.customerCount, 2);
});

test('throws when a customer is missing a cohort', () => {
  assert.throws(() => compareCohortSurvival([{ customerId: 'A', tenureDays: 5, churned: true }]));
});

test('throws on an empty customers array', () => {
  assert.throws(() => compareCohortSurvival([]));
});

console.log(`\n${passed}/${total} passing`);
