'use strict';
const assert = require('assert');
const { fitDecayCurve, projectRefreshDate } = require('./analyzer.js');

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

function makeSynthetic(ctr0, k, days) {
  return days.map((d) => ({ daysLive: d, ctr: ctr0 * Math.exp(-k * d) }));
}

test('throws with fewer than 3 points', () => {
  assert.throws(() => fitDecayCurve([{ daysLive: 0, ctr: 0.05 }]));
});

test('throws on non-numeric point', () => {
  assert.throws(() => fitDecayCurve([{ daysLive: 0, ctr: 0.05 }, { daysLive: 'x', ctr: 0.04 }, { daysLive: 2, ctr: 0.03 }]));
});

test('throws when a ctr value is zero or negative', () => {
  assert.throws(() => fitDecayCurve([{ daysLive: 0, ctr: 0.05 }, { daysLive: 1, ctr: 0 }, { daysLive: 2, ctr: 0.03 }]), /must be > 0/);
});

test('throws when all daysLive values are identical', () => {
  assert.throws(() => fitDecayCurve([{ daysLive: 5, ctr: 0.05 }, { daysLive: 5, ctr: 0.04 }, { daysLive: 5, ctr: 0.03 }]), /identical/);
});

test('recovers known ctr0 and k from clean synthetic exponential decay', () => {
  const history = makeSynthetic(0.05, 0.03, [0, 5, 10, 15, 20, 25, 30]);
  const model = fitDecayCurve(history);
  assert.ok(Math.abs(model.ctr0 - 0.05) < 0.0005, `ctr0 off: ${model.ctr0}`);
  assert.ok(Math.abs(model.k - 0.03) < 0.001, `k off: ${model.k}`);
  assert.ok(model.rSquared > 0.999, `expected near-perfect fit, got ${model.rSquared}`);
});

test('a flat/non-decaying creative fits k near zero', () => {
  const history = [
    { daysLive: 0, ctr: 0.04 },
    { daysLive: 10, ctr: 0.041 },
    { daysLive: 20, ctr: 0.0395 },
    { daysLive: 30, ctr: 0.04 },
  ];
  const model = fitDecayCurve(history);
  assert.ok(Math.abs(model.k) < 0.01, `expected near-zero k, got ${model.k}`);
});

test('projectRefreshDate returns null projection when k <= 0 (no real decay)', () => {
  const result = projectRefreshDate({ ctr0: 0.04, k: 0 }, 0.01, '2026-08-01');
  assert.strictEqual(result.daysUntilFatigue, null);
  assert.strictEqual(result.refreshByDate, null);
  assert.strictEqual(result.alreadyFatigued, false);
});

test('projectRefreshDate flags already-fatigued when ctr0 is already at/below threshold', () => {
  const result = projectRefreshDate({ ctr0: 0.008, k: 0.02 }, 0.01, '2026-08-01');
  assert.strictEqual(result.alreadyFatigued, true);
  assert.strictEqual(result.daysUntilFatigue, 0);
  assert.strictEqual(result.refreshByDate, '2026-08-01');
});

test('projectRefreshDate computes a specific future calendar date for a real decay case', () => {
  // ctr0=0.05, k=0.03, threshold=0.01 -> days = ln(5)/0.03 ~= 53.6 -> ceil 54
  const result = projectRefreshDate({ ctr0: 0.05, k: 0.03 }, 0.01, '2026-01-01');
  assert.strictEqual(result.alreadyFatigued, false);
  assert.ok(Math.abs(result.daysUntilFatigue - 53.6) < 0.2, `days off: ${result.daysUntilFatigue}`);
  assert.strictEqual(result.refreshByDate, '2026-02-24'); // Jan 1 + 54 days
});

test('projectRefreshDate throws on invalid fatigueThreshold', () => {
  assert.throws(() => projectRefreshDate({ ctr0: 0.05, k: 0.03 }, 0, '2026-01-01'));
  assert.throws(() => projectRefreshDate({ ctr0: 0.05, k: 0.03 }, -1, '2026-01-01'));
});

test('projectRefreshDate throws on invalid launch date string', () => {
  assert.throws(() => projectRefreshDate({ ctr0: 0.05, k: 0.03 }, 0.01, 'not-a-date'));
});

test('faster-decaying creative (higher k) projects an earlier refresh date than a slower one', () => {
  const fast = projectRefreshDate({ ctr0: 0.05, k: 0.08 }, 0.01, '2026-01-01');
  const slow = projectRefreshDate({ ctr0: 0.05, k: 0.01 }, 0.01, '2026-01-01');
  assert.ok(fast.daysUntilFatigue < slow.daysUntilFatigue);
});

console.log(`\n${passed}/12 passing`);
