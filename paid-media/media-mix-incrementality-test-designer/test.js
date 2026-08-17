'use strict';
const assert = require('assert');
const { inverseNormalCdf, computeRequiredSampleSize, splitGeosForTest, estimateTestDurationDays } = require('./designer.js');

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

function approxEqual(a, b, eps) {
  assert.ok(Math.abs(a - b) < eps, `expected ~${b}, got ${a}`);
}

// --- inverseNormalCdf known-value regression tests ---
test('inverseNormalCdf throws outside (0,1)', () => {
  assert.throws(() => inverseNormalCdf(0));
  assert.throws(() => inverseNormalCdf(1));
});

test('inverseNormalCdf(0.5) is approximately 0', () => {
  approxEqual(inverseNormalCdf(0.5), 0, 0.0001);
});

test('inverseNormalCdf(0.975) matches the standard 95% two-tailed critical value (1.95996)', () => {
  approxEqual(inverseNormalCdf(0.975), 1.95996, 0.001);
});

test('inverseNormalCdf(0.8) matches the standard 80% power z-value (0.84162)', () => {
  approxEqual(inverseNormalCdf(0.8), 0.84162, 0.001);
});

test('inverseNormalCdf(0.9) matches the standard 90% z-value (1.28155)', () => {
  approxEqual(inverseNormalCdf(0.9), 1.28155, 0.001);
});

test('inverseNormalCdf handles a low-tail value (p < 0.02425) via the low-tail branch', () => {
  const z = inverseNormalCdf(0.001);
  assert.ok(z < -3, `expected a strongly negative z, got ${z}`);
});

// --- computeRequiredSampleSize ---
test('throws on invalid baselineRate', () => {
  assert.throws(() => computeRequiredSampleSize(1.5, 0.1));
});

test('throws on non-positive mde', () => {
  assert.throws(() => computeRequiredSampleSize(0.05, 0));
});

test('throws when the effect size pushes p2 to or past 1', () => {
  assert.throws(() => computeRequiredSampleSize(0.6, 1));
});

test('matches a hand-computed sample size within a reasonable tolerance', () => {
  // baselineRate=0.05, mde=0.1 (p2=0.055), power=0.8, alpha=0.05 -> hand-computed ~31,235
  const n = computeRequiredSampleSize(0.05, 0.1);
  assert.ok(n > 29000 && n < 34000, `expected ~31235, got ${n}`);
});

test('a smaller MDE requires a larger sample size than a larger MDE', () => {
  const nSmallEffect = computeRequiredSampleSize(0.05, 0.05);
  const nLargeEffect = computeRequiredSampleSize(0.05, 0.3);
  assert.ok(nSmallEffect > nLargeEffect);
});

test('higher required power increases the required sample size', () => {
  const nLowPower = computeRequiredSampleSize(0.05, 0.1, { power: 0.7 });
  const nHighPower = computeRequiredSampleSize(0.05, 0.1, { power: 0.95 });
  assert.ok(nHighPower > nLowPower);
});

// --- splitGeosForTest ---
test('throws with fewer than 2 geos', () => {
  assert.throws(() => splitGeosForTest([{ geoId: 'a', population: 100 }]));
});

test('produces a reasonably population-balanced split', () => {
  const geos = [
    { geoId: 'a', population: 1000000 },
    { geoId: 'b', population: 900000 },
    { geoId: 'c', population: 500000 },
    { geoId: 'd', population: 400000 },
  ];
  const result = splitGeosForTest(geos);
  const totalPop = 1000000 + 900000 + 500000 + 400000;
  const imbalance = Math.abs(result.testPopulation - result.controlPopulation) / totalPop;
  assert.ok(imbalance < 0.15, `expected reasonably balanced split, got imbalance ${imbalance}`);
});

test('every geo is assigned to exactly one group', () => {
  const geos = [
    { geoId: 'a', population: 100 },
    { geoId: 'b', population: 200 },
    { geoId: 'c', population: 300 },
  ];
  const result = splitGeosForTest(geos);
  assert.strictEqual(result.test.length + result.control.length, 3);
  const allAssigned = new Set([...result.test, ...result.control]);
  assert.strictEqual(allAssigned.size, 3);
});

// --- estimateTestDurationDays ---
test('throws on non-positive inputs', () => {
  assert.throws(() => estimateTestDurationDays(0, 10));
  assert.throws(() => estimateTestDurationDays(100, 0));
});

test('computes a correct ceiling-rounded day count', () => {
  assert.strictEqual(estimateTestDurationDays(1000, 300), 4); // 3.33 -> 4
});

test('an exact division still rounds correctly', () => {
  assert.strictEqual(estimateTestDurationDays(900, 300), 3);
});

console.log(`\n${passed}/17 passing`);
