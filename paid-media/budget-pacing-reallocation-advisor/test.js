'use strict';
const assert = require('assert');
const { computePacingStatus, recommendBudgetChange, DEFAULT_MAX_CHANGE_PERCENT, DEFAULT_LEARNING_PHASE_COOLDOWN_DAYS } = require('./advisor.js');

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

// --- computePacingStatus ---
test('throws on non-positive targetSpend', () => {
  assert.throws(() => computePacingStatus(100, 0, 5, 30));
});

test('throws when daysElapsed exceeds totalDaysInPeriod', () => {
  assert.throws(() => computePacingStatus(100, 1000, 40, 30));
});

test('correctly identifies on-pace spend', () => {
  // 15 of 30 days elapsed (50%), spent 50% of target
  const result = computePacingStatus(500, 1000, 15, 30);
  assert.strictEqual(result.status, 'on_pace');
});

test('correctly identifies under-pacing spend', () => {
  const result = computePacingStatus(200, 1000, 15, 30); // expected 500, only spent 200
  assert.strictEqual(result.status, 'under_pacing');
});

test('correctly identifies over-pacing spend', () => {
  const result = computePacingStatus(800, 1000, 15, 30); // expected 500, spent 800
  assert.strictEqual(result.status, 'over_pacing');
});

// --- recommendBudgetChange ---
test('throws on missing campaignId', () => {
  assert.throws(() => recommendBudgetChange({ currentDailyBudget: 100, performanceScore: 1, daysSinceLastBudgetChange: 10 }));
});

test('throws on non-positive currentDailyBudget', () => {
  assert.throws(() => recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 0, performanceScore: 1, daysSinceLastBudgetChange: 10 }));
});

test('holds when within the learning-phase cooldown window, regardless of performance', () => {
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 2.0, daysSinceLastBudgetChange: 2 });
  assert.strictEqual(result.action, 'hold');
  assert.ok(result.reason.includes('learning-phase cooldown'));
});

test('recommends an increase for a strongly over-performing campaign past the cooldown', () => {
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 1.5, daysSinceLastBudgetChange: 10 });
  assert.strictEqual(result.action, 'increase');
});

test('recommends a decrease for a strongly under-performing campaign past the cooldown', () => {
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 0.5, daysSinceLastBudgetChange: 10 });
  assert.strictEqual(result.action, 'decrease');
});

test('holds when performance is close to target (no meaningful change needed)', () => {
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 1.005, daysSinceLastBudgetChange: 10 });
  assert.strictEqual(result.action, 'hold');
});

test('caps a large recommended increase at maxChangePercent to avoid a learning-phase reset', () => {
  // performanceScore 2.0 implies a 100% increase, but should be capped at the default 20%
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 2.0, daysSinceLastBudgetChange: 10 });
  assert.strictEqual(result.changePercent, DEFAULT_MAX_CHANGE_PERCENT);
  assert.strictEqual(result.recommendedDailyBudget, 120);
  assert.ok(result.reason.includes('capped'));
});

test('caps a large recommended decrease symmetrically', () => {
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 0.1, daysSinceLastBudgetChange: 10 });
  assert.strictEqual(result.changePercent, -DEFAULT_MAX_CHANGE_PERCENT);
  assert.strictEqual(result.recommendedDailyBudget, 80);
});

test('a custom maxChangePercent is respected', () => {
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 2.0, daysSinceLastBudgetChange: 10 }, { maxChangePercent: 0.1 });
  assert.strictEqual(result.changePercent, 0.1);
  assert.strictEqual(result.recommendedDailyBudget, 110);
});

test('exactly at the cooldown boundary is treated as past cooldown (not held)', () => {
  const result = recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 1.5, daysSinceLastBudgetChange: DEFAULT_LEARNING_PHASE_COOLDOWN_DAYS });
  assert.notStrictEqual(result.action, 'hold');
});

test('throws on invalid maxChangePercent', () => {
  assert.throws(() => recommendBudgetChange({ campaignId: 'a', currentDailyBudget: 100, performanceScore: 1, daysSinceLastBudgetChange: 10 }, { maxChangePercent: 1.5 }));
});

console.log(`\n${passed}/16 passing`);
