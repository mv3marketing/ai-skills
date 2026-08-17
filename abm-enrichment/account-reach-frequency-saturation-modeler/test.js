'use strict';
const assert = require('assert');
const {
  calibrateAttentionProbability,
  cumulativeReachProbability,
  marginalReachGain,
  modelAccountReach,
  DEFAULT_OVERSATURATION_THRESHOLD,
  DEFAULT_UNDERREACH_THRESHOLD,
} = require('./modeler.js');

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

function approxEqual(a, b, tol = 0.0001) {
  assert.ok(Math.abs(a - b) < tol, `expected ${a} to be within ${tol} of ${b}`);
}

// --- calibrateAttentionProbability ---
test('hand-verified calibration: 50% engagement at 4 avg impressions', () => {
  approxEqual(calibrateAttentionProbability(0.5, 4), 0.159104);
});

test('round-trips back through cumulativeReachProbability to the original observed rate', () => {
  const p = calibrateAttentionProbability(0.5, 4);
  approxEqual(cumulativeReachProbability(4, p), 0.5, 0.001);
});

test('throws on an out-of-range observedEngagementRate', () => {
  assert.throws(() => calibrateAttentionProbability(1.5, 4));
  assert.throws(() => calibrateAttentionProbability(0, 4));
});

test('throws on a non-positive avgImpressionsPerContact', () => {
  assert.throws(() => calibrateAttentionProbability(0.5, 0));
});

// --- cumulativeReachProbability ---
test('a single impression at p=0.2 gives exactly 0.2 reach', () => {
  assert.strictEqual(cumulativeReachProbability(1, 0.2), 0.2);
});

test('hand-verified: 5 impressions at p=0.2 gives 1-0.8^5', () => {
  assert.strictEqual(cumulativeReachProbability(5, 0.2), 0.67232);
});

test('zero impressions gives zero reach', () => {
  assert.strictEqual(cumulativeReachProbability(0, 0.2), 0);
});

test('reach approaches but never quite reaches 1 as impressions grow', () => {
  // at 100 impressions, 0.8^100 is ~1.27e-10 -- indistinguishable from 0
  // at the function's 6-decimal rounding, so use a count where the
  // remaining gap survives rounding to make this a meaningful assertion.
  const reach = cumulativeReachProbability(30, 0.2);
  assert.ok(reach < 1 && reach > 0.998);
});

test('throws on p outside (0,1]', () => {
  assert.throws(() => cumulativeReachProbability(5, 0));
  assert.throws(() => cumulativeReachProbability(5, 1.5));
});

test('throws on negative impressions', () => {
  assert.throws(() => cumulativeReachProbability(-1, 0.2));
});

// --- marginalReachGain ---
test('hand-verified: marginal gain of the very first impression equals p itself', () => {
  assert.strictEqual(marginalReachGain(0, 0.2), 0.2);
});

test('hand-verified: marginal gain after 5 impressions at p=0.2', () => {
  assert.strictEqual(marginalReachGain(5, 0.2), 0.065536);
});

test('marginal gain strictly decreases as impressions accumulate (diminishing returns)', () => {
  const gainEarly = marginalReachGain(1, 0.2);
  const gainLate = marginalReachGain(10, 0.2);
  assert.ok(gainLate < gainEarly);
});

// --- modelAccountReach ---
test('hand-verified combined committee reach for two contacts', () => {
  const result = modelAccountReach(
    [
      { contactId: 'c1', role: 'champion', impressions: 10 },
      { contactId: 'c2', role: 'buyer', impressions: 2 },
    ],
    0.2
  );
  approxEqual(result.contacts[0].reachProbability, 0.892626);
  approxEqual(result.contacts[1].reachProbability, 0.36);
  // combined = 1 - (1-0.892626)*(1-0.36)
  approxEqual(result.combinedCommitteeReach, 0.931281);
});

test('a heavily-impressed contact is flagged oversaturated', () => {
  const result = modelAccountReach([{ contactId: 'c1', role: 'champion', impressions: 50 }], 0.2);
  assert.strictEqual(result.contacts[0].isOversaturated, true);
  assert.strictEqual(result.anyOversaturated, true);
});

test('a lightly-impressed contact is flagged underreached', () => {
  const result = modelAccountReach([{ contactId: 'c1', role: 'buyer', impressions: 1 }], 0.2);
  assert.strictEqual(result.contacts[0].isUnderreached, true);
  assert.strictEqual(result.anyUnderreached, true);
});

test('a moderately-reached contact is flagged neither oversaturated nor underreached', () => {
  const result = modelAccountReach([{ contactId: 'c1', role: 'buyer', impressions: 5 }], 0.2);
  assert.strictEqual(result.contacts[0].isOversaturated, false);
  assert.strictEqual(result.contacts[0].isUnderreached, false);
});

test('custom thresholds change the classification', () => {
  const strict = modelAccountReach([{ contactId: 'c1', role: 'buyer', impressions: 5 }], 0.2, { underreachThreshold: 0.7 });
  assert.strictEqual(strict.contacts[0].isUnderreached, true);
});

test('throws on an empty contacts array', () => {
  assert.throws(() => modelAccountReach([], 0.2));
});

test('throws when a contact is missing contactId', () => {
  assert.throws(() => modelAccountReach([{ role: 'buyer', impressions: 5 }], 0.2));
});

test('default thresholds are the documented values', () => {
  assert.strictEqual(DEFAULT_OVERSATURATION_THRESHOLD, 0.95);
  assert.strictEqual(DEFAULT_UNDERREACH_THRESHOLD, 0.3);
});

console.log(`\n${passed}/${total} passing`);
