'use strict';
const assert = require('assert');
const { computeChiSquareStatistic, pValueChiSquareDf1, detectSRM, detectSRMMultiArm, DEFAULT_ALPHA } = require('./srm.js');

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

function approxEqual(a, b, tol = 0.001) {
  assert.ok(Math.abs(a - b) < tol, `expected ${a} to be within ${tol} of ${b}`);
}

// --- computeChiSquareStatistic ---
test('hand-verified chi-square statistic on a clean round-number case', () => {
  // observed [100,150], expected [125,125] -> (25^2/125)*2 = 10
  assert.strictEqual(computeChiSquareStatistic([100, 150], [125, 125]), 10);
});

test('a perfect match between observed and expected yields chi-square of 0', () => {
  assert.strictEqual(computeChiSquareStatistic([50, 50], [50, 50]), 0);
});

test('throws when array lengths differ', () => {
  assert.throws(() => computeChiSquareStatistic([1, 2], [1]));
});

test('throws on a non-positive expected count', () => {
  assert.throws(() => computeChiSquareStatistic([1, 2], [0, 3]));
});

// --- pValueChiSquareDf1, cross-checked against the standard published critical value table ---
test('matches the published df=1 critical value for alpha=0.05 (chi-square 3.841)', () => {
  approxEqual(pValueChiSquareDf1(3.841), 0.05, 0.001);
});

test('matches the published df=1 critical value for alpha=0.01 (chi-square 6.635)', () => {
  approxEqual(pValueChiSquareDf1(6.635), 0.01, 0.001);
});

test('matches the published df=1 critical value for alpha=0.001 (chi-square 10.828)', () => {
  approxEqual(pValueChiSquareDf1(10.828), 0.001, 0.0002);
});

test('a chi-square of 0 yields a p-value of ~1 (within the erf approximation\'s ~1.5e-7 error bound)', () => {
  approxEqual(pValueChiSquareDf1(0), 1, 1e-6);
});

test('throws on a negative chi-square', () => {
  assert.throws(() => pValueChiSquareDf1(-1));
});

// --- detectSRM ---
test('a perfectly balanced 50/50 split is not flagged as SRM', () => {
  const result = detectSRM(5000, 5000);
  assert.strictEqual(result.chiSquare, 0);
  assert.strictEqual(result.pValue, 1);
  assert.strictEqual(result.isSRM, false);
});

test('a moderate imbalance under the strict default threshold is NOT flagged (ordinary sampling noise)', () => {
  const result = detectSRM(100, 150);
  assert.strictEqual(result.chiSquare, 10);
  assert.strictEqual(result.isSRM, false); // p=0.00157, not below the default alpha of 0.001
});

test('a larger imbalance past the strict default threshold IS flagged', () => {
  const result = detectSRM(100, 160);
  assert.strictEqual(result.isSRM, true);
});

test('respects a custom expectedRatioA for an unequal intended split', () => {
  // intended 30/70 split, observed matches almost exactly -> no SRM
  const result = detectSRM(300, 700, { expectedRatioA: 0.3 });
  assert.strictEqual(result.isSRM, false);
  approxEqual(result.chiSquare, 0, 0.01);
});

test('a custom, looser alpha changes the verdict on a borderline case', () => {
  const strict = detectSRM(100, 150, { alpha: 0.001 });
  const loose = detectSRM(100, 150, { alpha: 0.01 });
  assert.strictEqual(strict.isSRM, false);
  assert.strictEqual(loose.isSRM, true);
});

test('throws on negative observed counts', () => {
  assert.throws(() => detectSRM(-5, 100));
});

test('throws when both observed counts are zero', () => {
  assert.throws(() => detectSRM(0, 0));
});

test('throws on an out-of-range expectedRatioA', () => {
  assert.throws(() => detectSRM(100, 100, { expectedRatioA: 1.5 }));
});

test('DEFAULT_ALPHA is deliberately much stricter than a typical 0.05 significance threshold', () => {
  assert.strictEqual(DEFAULT_ALPHA, 0.001);
});

// --- detectSRMMultiArm ---
test('a 3-arm test computes the correct degrees of freedom', () => {
  const result = detectSRMMultiArm([1000, 1000, 1000], [1 / 3, 1 / 3, 1 / 3]);
  assert.strictEqual(result.degreesOfFreedom, 2);
  assert.strictEqual(result.pValue, null); // honestly not computed for df > 1
});

test('a 2-arm call through the multi-arm function still gets an exact p-value', () => {
  const result = detectSRMMultiArm([100, 150], [0.5, 0.5]);
  assert.strictEqual(result.chiSquare, 10);
  assert.strictEqual(result.pValue, 0.001566);
});

test('throws when expectedRatios do not sum to 1', () => {
  assert.throws(() => detectSRMMultiArm([100, 100, 100], [0.3, 0.3, 0.3]));
});

test('throws with fewer than 2 arms', () => {
  assert.throws(() => detectSRMMultiArm([100], [1]));
});

console.log(`\n${passed}/${total} passing`);
