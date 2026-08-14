'use strict';
const assert = require('assert');
const { narrateAnomaly, CATEGORY_PRIORS } = require('./narrator.js');

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

test('throws on invalid anomaly date', () => {
  assert.throws(() => narrateAnomaly('not-a-date', []));
});

test('throws when events is not an array', () => {
  assert.throws(() => narrateAnomaly('2026-08-01', 'nope'));
});

test('throws on unknown event type', () => {
  assert.throws(() => narrateAnomaly('2026-08-01', [{ type: 'mystery_event', date: '2026-08-01' }]), /Unknown event type/);
});

test('throws on invalid event date', () => {
  assert.throws(() => narrateAnomaly('2026-08-01', [{ type: 'gtm_publish', date: 'nope' }]), /invalid date/);
});

test('empty events array returns empty ranked list and null topCategory', () => {
  const result = narrateAnomaly('2026-08-01', []);
  assert.deepStrictEqual(result.ranked, []);
  assert.strictEqual(result.topCategory, null);
});

test('an event on the exact anomaly date gets full prior confidence', () => {
  const result = narrateAnomaly('2026-08-01', [{ type: 'tag_error', date: '2026-08-01', description: 'GTM container fatal error' }]);
  assert.strictEqual(result.ranked[0].confidence, CATEGORY_PRIORS.tag_error.prior);
  assert.strictEqual(result.ranked[0].daysFromAnomaly, 0);
});

test('confidence decays with distance from the anomaly date', () => {
  const result = narrateAnomaly('2026-08-10', [
    { type: 'gsc_ranking_change', date: '2026-08-10', description: 'near' },
    { type: 'gsc_ranking_change', date: '2026-07-01', description: 'far' },
  ]);
  const near = result.ranked.find((r) => r.description === 'near');
  const far = result.ranked.find((r) => r.description === 'far');
  assert.ok(near.confidence > far.confidence);
});

test('confidence roughly halves at the configured half-life', () => {
  const result = narrateAnomaly('2026-08-10', [{ type: 'ad_spend_change', date: '2026-08-08' }], { proximityHalfLifeDays: 2 });
  // 2 days out with a 2-day half-life -> proximity weight ~0.5
  const expected = CATEGORY_PRIORS.ad_spend_change.prior * 0.5;
  assert.ok(Math.abs(result.ranked[0].confidence - expected) < 0.01);
});

test('ranks a same-day tag error above a distant GSC ranking change', () => {
  const result = narrateAnomaly('2026-08-10', [
    { type: 'gsc_ranking_change', date: '2026-07-15', description: 'old ranking shift' },
    { type: 'tag_error', date: '2026-08-10', description: 'today tag error' },
  ]);
  assert.strictEqual(result.ranked[0].description, 'today tag error');
});

test('topCategory correctly reflects the highest-confidence event category', () => {
  const result = narrateAnomaly('2026-08-10', [
    { type: 'tag_error', date: '2026-08-10' }, // tracking
  ]);
  assert.strictEqual(result.topCategory, 'tracking');
});

test('throws on non-positive proximityHalfLifeDays', () => {
  assert.throws(() => narrateAnomaly('2026-08-01', [], { proximityHalfLifeDays: 0 }));
});

test('handles multiple same-type events independently, sorted correctly', () => {
  const result = narrateAnomaly('2026-08-10', [
    { type: 'seasonal', date: '2026-08-09', description: 'a' },
    { type: 'seasonal', date: '2026-08-01', description: 'b' },
    { type: 'seasonal', date: '2026-08-10', description: 'c' },
  ]);
  assert.strictEqual(result.ranked[0].description, 'c');
  assert.strictEqual(result.ranked[2].description, 'b');
});

console.log(`\n${passed}/12 passing`);
