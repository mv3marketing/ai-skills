'use strict';
const assert = require('assert');
const { twoProportionZTest, erf, normalCdf } = require('./validator.js');

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
  assert.ok(Math.abs(a - b) < eps, `expected ~${b}, got ${a} (eps ${eps})`);
}

// --- erf / normalCdf sanity ---
test('erf(0) is approximately 0 (Abramowitz-Stegun approximation, not exact at the boundary)', () => approxEqual(erf(0), 0, 1e-8));
test('erf is an odd function', () => approxEqual(erf(-1.5), -erf(1.5), 1e-9));
test('normalCdf(0) === 0.5', () => approxEqual(normalCdf(0), 0.5, 1e-9));
test('normalCdf(1.96) is approximately 0.975 (standard 95% two-tailed critical value)', () => {
  approxEqual(normalCdf(1.96), 0.975, 0.001);
});

// --- input validation ---
test('throws on negative inputs', () => {
  assert.throws(() => twoProportionZTest(-1, 0, 100, 10));
});
test('throws when successes exceed sample size', () => {
  assert.throws(() => twoProportionZTest(100, 150, 100, 10));
});
test('throws on zero sample size', () => {
  assert.throws(() => twoProportionZTest(0, 0, 100, 10));
});
test('throws on invalid alpha', () => {
  assert.throws(() => twoProportionZTest(100, 10, 100, 10, 1.5));
});

// --- known-value regression tests, hand-computed against the pooled-variance z-test formula ---
test('small sample, modest lift: correctly NOT significant at alpha=0.05', () => {
  // nA=1000 xA=100 (10%), nB=1000 xB=120 (12%) -> hand-computed z ~= 1.4293, p ~= 0.153
  const r = twoProportionZTest(1000, 100, 1000, 120);
  approxEqual(r.zStatistic, 1.4293, 0.01);
  approxEqual(r.pValue, 0.153, 0.01);
  assert.strictEqual(r.significant, false);
});

test('same lift, 10x sample: correctly IS significant at alpha=0.05', () => {
  // nA=10000 xA=1000 (10%), nB=10000 xB=1200 (12%) -> hand-computed z ~= 4.52, p ~= 0.000006
  const r = twoProportionZTest(10000, 1000, 10000, 1200);
  approxEqual(r.zStatistic, 4.52, 0.02);
  assert.ok(r.pValue < 0.0001);
  assert.strictEqual(r.significant, true);
});

test('identical proportions produce a z-statistic of 0 and p-value of 1', () => {
  const r = twoProportionZTest(500, 50, 500, 50);
  assert.strictEqual(r.zStatistic, 0);
  assert.strictEqual(r.pValue, 1);
  assert.strictEqual(r.significant, false);
});

test('confidence interval of the difference brackets 0 for a non-significant result', () => {
  const r = twoProportionZTest(1000, 100, 1000, 120);
  assert.ok(r.confidenceIntervalOfDifference[0] < 0 && r.confidenceIntervalOfDifference[1] > 0);
});

test('confidence interval of the difference excludes 0 for a clearly significant result', () => {
  const r = twoProportionZTest(10000, 1000, 10000, 1200);
  assert.ok(r.confidenceIntervalOfDifference[0] > 0);
});

test('flags a warning when sample size is below the recommended floor', () => {
  const r = twoProportionZTest(50, 10, 50, 15);
  assert.ok(r.warning !== null);
});

test('does not warn when sample size is comfortably above the recommended floor', () => {
  const r = twoProportionZTest(10000, 1000, 10000, 1200);
  assert.strictEqual(r.warning, null);
});

test('a small-sample "winner" with a lucky spike is correctly flagged as both underpowered AND not statistically significant', () => {
  // Classic false-positive trap: B looks 50% better but on tiny volume
  const r = twoProportionZTest(20, 2, 20, 3);
  assert.strictEqual(r.significant, false);
  assert.ok(r.warning !== null);
});

console.log(`\n${passed}/16 passing`);
