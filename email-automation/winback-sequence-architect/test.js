'use strict';
const assert = require('assert');
const { planWinback, TIER_TRIGGER_DAYS, MAX_ATTEMPTS, ATTEMPT_SPACING_DAYS } = require('./architect.js');

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

test('throws on missing daysSinceLastEngagement', () => {
  assert.throws(() => planWinback({ historicalEngagementTier: 'high' }));
});

test('throws on invalid historicalEngagementTier', () => {
  assert.throws(() => planWinback({ daysSinceLastEngagement: 50, historicalEngagementTier: 'ultra' }));
});

test('throws when priorWinbackAttempts > 0 but daysSinceLastWinbackAttempt is missing', () => {
  assert.throws(() => planWinback({ daysSinceLastEngagement: 50, historicalEngagementTier: 'high', priorWinbackAttempts: 1 }));
});

test('too_early for a high-tier customer under their 45-day threshold', () => {
  const result = planWinback({ daysSinceLastEngagement: 20, historicalEngagementTier: 'high' });
  assert.strictEqual(result.action, 'too_early');
});

test('send_attempt for a high-tier customer at exactly their threshold, healthy domain', () => {
  const result = planWinback({ daysSinceLastEngagement: 45, historicalEngagementTier: 'high' }, { bounceRate: 0.005, complaintRate: 0.0002 });
  assert.strictEqual(result.action, 'send_attempt');
  assert.strictEqual(result.attemptNumber, 1);
});

test('a low-tier customer triggers much earlier than a high-tier customer', () => {
  const lowTier = planWinback({ daysSinceLastEngagement: 15, historicalEngagementTier: 'low' });
  const highTier = planWinback({ daysSinceLastEngagement: 15, historicalEngagementTier: 'high' });
  assert.strictEqual(lowTier.action, 'send_attempt');
  assert.strictEqual(highTier.action, 'too_early');
});

test('suppress once priorWinbackAttempts reaches MAX_ATTEMPTS', () => {
  const result = planWinback({ daysSinceLastEngagement: 200, historicalEngagementTier: 'high', priorWinbackAttempts: MAX_ATTEMPTS, daysSinceLastWinbackAttempt: 20 });
  assert.strictEqual(result.action, 'suppress');
});

test('does not suppress just under the MAX_ATTEMPTS threshold', () => {
  const result = planWinback({ daysSinceLastEngagement: 200, historicalEngagementTier: 'high', priorWinbackAttempts: MAX_ATTEMPTS - 1, daysSinceLastWinbackAttempt: 20 }, { bounceRate: 0.005, complaintRate: 0.0002 });
  assert.notStrictEqual(result.action, 'suppress');
});

test('too_early when the spacing since the last winback attempt is under ATTEMPT_SPACING_DAYS', () => {
  const result = planWinback({ daysSinceLastEngagement: 200, historicalEngagementTier: 'high', priorWinbackAttempts: 1, daysSinceLastWinbackAttempt: 5 });
  assert.strictEqual(result.action, 'too_early');
});

test('hold_for_deliverability when the domain bounce rate exceeds the safe threshold', () => {
  const result = planWinback({ daysSinceLastEngagement: 45, historicalEngagementTier: 'high' }, { bounceRate: 0.08, complaintRate: 0.0002 });
  assert.strictEqual(result.action, 'hold_for_deliverability');
});

test('hold_for_deliverability when the domain complaint rate exceeds the safe threshold', () => {
  const result = planWinback({ daysSinceLastEngagement: 45, historicalEngagementTier: 'high' }, { bounceRate: 0.005, complaintRate: 0.01 });
  assert.strictEqual(result.action, 'hold_for_deliverability');
});

test('proceeds to send_attempt when no domainRisk is provided at all', () => {
  const result = planWinback({ daysSinceLastEngagement: 45, historicalEngagementTier: 'high' });
  assert.strictEqual(result.action, 'send_attempt');
});

test('second attempt trigger threshold is later than the first (tiered + spacing)', () => {
  const first = planWinback({ daysSinceLastEngagement: 45, historicalEngagementTier: 'high' });
  assert.strictEqual(first.action, 'send_attempt');
  // Simulate: after attempt 1, need daysSinceLastEngagement >= 45 + 15 = 60 for attempt 2
  const tooEarlyForSecond = planWinback({ daysSinceLastEngagement: 55, historicalEngagementTier: 'high', priorWinbackAttempts: 1, daysSinceLastWinbackAttempt: 10 });
  assert.strictEqual(tooEarlyForSecond.action, 'too_early');
});

test('TIER_TRIGGER_DAYS orders high > medium > low', () => {
  assert.ok(TIER_TRIGGER_DAYS.high > TIER_TRIGGER_DAYS.medium);
  assert.ok(TIER_TRIGGER_DAYS.medium > TIER_TRIGGER_DAYS.low);
});

test('throws on negative priorWinbackAttempts', () => {
  assert.throws(() => planWinback({ daysSinceLastEngagement: 50, historicalEngagementTier: 'high', priorWinbackAttempts: -1, daysSinceLastWinbackAttempt: 5 }));
});

console.log(`\n${passed}/15 passing`);
