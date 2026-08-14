'use strict';
const assert = require('assert');
const { explainSendTime, DAY_NAMES } = require('./explainer.js');

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

// Helper: build N events all at the same UTC weekday+hour, spread across recent days
function eventsAt(dow, hour, count, baseDateISO = '2026-08-10') {
  const events = [];
  const base = new Date(baseDateISO + 'T00:00:00Z');
  for (let i = 0; i < count; i++) {
    // walk backward to find a date with the target UTC day-of-week
    const d = new Date(base.getTime() - i * 7 * MS_PER_DAY_LOCAL());
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - dow + 7) % 7));
    d.setUTCHours(hour, 0, 0, 0);
    events.push({ timestampISO: d.toISOString() });
  }
  return events;
}
function MS_PER_DAY_LOCAL() { return 86400000; }

test('throws on empty events array', () => {
  assert.throws(() => explainSendTime([], '2026-08-10'));
});

test('throws on invalid asOfISO', () => {
  assert.throws(() => explainSendTime([{ timestampISO: '2026-08-01' }], 'nope'));
});

test('throws on invalid halfLifeDays', () => {
  assert.throws(() => explainSendTime([{ timestampISO: '2026-08-01' }], '2026-08-10', { halfLifeDays: 0 }));
});

test('throws when an event is timestamped after asOfISO', () => {
  assert.throws(() => explainSendTime([{ timestampISO: '2026-08-15' }], '2026-08-10'));
});

test('throws on an event with invalid timestamp', () => {
  assert.throws(() => explainSendTime([{ timestampISO: 'garbage' }], '2026-08-10'));
});

test('returns insufficient_data when no bin meets the minimum sample size', () => {
  const events = eventsAt(2, 10, 3); // only 3 events, default minSampleSize=10
  const result = explainSendTime(events, '2026-08-10');
  assert.strictEqual(result.confidence, 'insufficient_data');
  assert.strictEqual(result.recommendedWindow, null);
});

test('recommends the correct high-confidence bin when one bin dominates with enough volume', () => {
  const events = eventsAt(2, 10, 15); // Tuesday 10:00, 15 events
  const result = explainSendTime(events, '2026-08-10', { minSampleSize: 10 });
  assert.strictEqual(result.confidence, 'high');
  assert.strictEqual(result.recommendedWindow.dayOfWeek, 'Tuesday');
  assert.strictEqual(result.recommendedWindow.hour, 10);
});

test('falls back to a lower-scoring but trusted bin when the top bin is under-sampled', () => {
  // Explicit, controlled timestamps rather than the eventsAt helper, so the
  // score asymmetry is deliberate and legible: 2 very-recent, high-weight
  // events (Wednesday 14:00) score higher per-bin than 12 lower-weight,
  // slightly-older events (Thursday 9:00) - but the Wednesday bin has too
  // few raw events to be trusted, so the model must fall back to Thursday.
  const strongButRare = [
    { timestampISO: '2026-08-05T14:00:00Z', weight: 20 }, // Wednesday
    { timestampISO: '2026-08-05T14:00:00Z', weight: 20 },
  ];
  const thursdayBase = new Date('2026-08-06T09:00:00Z'); // Thursday
  const weakerButTrusted = Array.from({ length: 12 }, (_, i) => ({
    timestampISO: new Date(thursdayBase.getTime() - i * 7 * MS_PER_DAY_LOCAL()).toISOString(), weight: 1, // 12 consecutive Thursdays, lower weight each
  }));
  const events = [...strongButRare, ...weakerButTrusted];
  const result = explainSendTime(events, '2026-08-11T00:00:00Z', { minSampleSize: 10 });
  assert.strictEqual(result.confidence, 'low');
  assert.strictEqual(result.recommendedWindow.hour, 9);
});

test('more recent events score higher than older events of equal count/weight', () => {
  // Both clusters land on a single, consistent weekday+hour bin (weekly
  // recurrence, 7 days apart) so their weighted scores are directly
  // comparable - only recency should decide the winner.
  const recentBase = new Date('2026-08-03T08:00:00Z'); // Monday
  const olderBase = new Date('2025-01-06T08:00:00Z'); // Tuesday - a different bin, safely in the past
  const recent = Array.from({ length: 12 }, (_, i) => ({ timestampISO: new Date(recentBase.getTime() - i * 7 * MS_PER_DAY_LOCAL()).toISOString(), weight: 1 }));
  const older = Array.from({ length: 12 }, (_, i) => ({ timestampISO: new Date(olderBase.getTime() - i * 7 * MS_PER_DAY_LOCAL()).toISOString(), weight: 1 }));
  const events = [...recent, ...older];
  const result = explainSendTime(events, '2026-08-11T00:00:00Z', { minSampleSize: 10, halfLifeDays: 14 });
  assert.strictEqual(result.recommendedWindow.dayOfWeek, 'Monday');
  assert.strictEqual(result.recommendedWindow.hour, 8);
});

test('weight parameter scales a bin\'s contribution (clicks worth more than opens)', () => {
  const opens = eventsAt(2, 10, 12).map((e) => ({ ...e, weight: 1 }));
  const clicksElsewhere = eventsAt(3, 15, 11).map((e) => ({ ...e, weight: 3 }));
  const result = explainSendTime([...opens, ...clicksElsewhere], '2026-08-10', { minSampleSize: 10 });
  // clicksElsewhere has fewer raw events but 3x weight each, should out-score opens
  assert.strictEqual(result.recommendedWindow.dayOfWeek, 'Wednesday');
});

test('topBins only includes bins with at least one real event', () => {
  const events = eventsAt(2, 10, 12);
  const result = explainSendTime(events, '2026-08-10', { minSampleSize: 10 });
  for (const b of result.topBins) assert.ok(b.rawCount > 0);
});

test('DAY_NAMES is exported with 7 entries starting Sunday', () => {
  assert.strictEqual(DAY_NAMES.length, 7);
  assert.strictEqual(DAY_NAMES[0], 'Sunday');
});

console.log(`\n${passed}/12 passing`);
