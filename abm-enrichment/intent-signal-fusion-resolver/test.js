'use strict';
const assert = require('assert');
const { fuseIntentSignals, decayedStrength } = require('./resolver.js');

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

test('decayedStrength at age 0 returns full strength', () => {
  assert.strictEqual(decayedStrength(0.8, 0, 14), 0.8);
});

test('decayedStrength at the half-life is roughly half', () => {
  const result = decayedStrength(0.8, 14, 14);
  assert.ok(Math.abs(result - 0.4) < 0.001);
});

test('throws when signals is not an array', () => {
  assert.throws(() => fuseIntentSignals('nope', '2026-08-10'));
});

test('throws on invalid asOfISO', () => {
  assert.throws(() => fuseIntentSignals([], 'nope'));
});

test('throws on out-of-range strength', () => {
  const signals = [{ source: '6sense', topic: 'competitor-x', strength: 1.5, timestampISO: '2026-08-01' }];
  assert.throws(() => fuseIntentSignals(signals, '2026-08-10'), /invalid strength/);
});

test('throws on missing topic', () => {
  const signals = [{ source: '6sense', strength: 0.5, timestampISO: '2026-08-01' }];
  assert.throws(() => fuseIntentSignals(signals, '2026-08-10'), /needs a topic/);
});

test('throws when a signal is timestamped after asOfISO', () => {
  const signals = [{ source: '6sense', topic: 'x', strength: 0.5, timestampISO: '2026-08-20' }];
  assert.throws(() => fuseIntentSignals(signals, '2026-08-10'), /after asOfISO/);
});

test('a single signal composite equals its decayed strength', () => {
  const signals = [{ source: '6sense', topic: 'competitor-x', strength: 0.6, timestampISO: '2026-08-10' }];
  const result = fuseIntentSignals(signals, '2026-08-10');
  assert.strictEqual(result[0].compositeScore, 0.6);
});

test('two corroborating sources produce a higher composite than either alone (not naive sum)', () => {
  const signals = [
    { source: '6sense', topic: 'competitor-x', strength: 0.5, timestampISO: '2026-08-10' },
    { source: 'ZoomInfo', topic: 'competitor-x', strength: 0.5, timestampISO: '2026-08-10' },
  ];
  const result = fuseIntentSignals(signals, '2026-08-10');
  // noisy-OR: 1 - (1-0.5)(1-0.5) = 0.75, NOT naive sum of 1.0
  assert.strictEqual(result[0].compositeScore, 0.75);
  assert.ok(result[0].compositeScore < 1.0, 'must not naively sum past meaningful bounds');
});

test('composite score is always bounded in [0,1] even with many strong sources', () => {
  const signals = [
    { source: 'A', topic: 'x', strength: 0.9, timestampISO: '2026-08-10' },
    { source: 'B', topic: 'x', strength: 0.9, timestampISO: '2026-08-10' },
    { source: 'C', topic: 'x', strength: 0.9, timestampISO: '2026-08-10' },
    { source: 'D', topic: 'x', strength: 0.9, timestampISO: '2026-08-10' },
  ];
  const result = fuseIntentSignals(signals, '2026-08-10');
  assert.ok(result[0].compositeScore <= 1 && result[0].compositeScore > 0.99);
});

test('separates signals into distinct topics correctly', () => {
  const signals = [
    { source: '6sense', topic: 'competitor-x', strength: 0.5, timestampISO: '2026-08-10' },
    { source: '6sense', topic: 'pricing-page-visit', strength: 0.3, timestampISO: '2026-08-10' },
  ];
  const result = fuseIntentSignals(signals, '2026-08-10');
  assert.strictEqual(result.length, 2);
});

test('older signals contribute less than fresh ones to the composite', () => {
  const fresh = [{ source: '6sense', topic: 'x', strength: 0.6, timestampISO: '2026-08-10' }];
  const old = [{ source: '6sense', topic: 'x', strength: 0.6, timestampISO: '2026-06-01' }];
  const freshResult = fuseIntentSignals(fresh, '2026-08-10');
  const oldResult = fuseIntentSignals(old, '2026-08-10');
  assert.ok(freshResult[0].compositeScore > oldResult[0].compositeScore);
});

test('contributingSources deduplicates repeated signals from the same source', () => {
  const signals = [
    { source: '6sense', topic: 'x', strength: 0.4, timestampISO: '2026-08-09' },
    { source: '6sense', topic: 'x', strength: 0.3, timestampISO: '2026-08-10' },
  ];
  const result = fuseIntentSignals(signals, '2026-08-10');
  assert.deepStrictEqual(result[0].contributingSources, ['6sense']);
  assert.strictEqual(result[0].sourceCount, 1);
});

test('results sorted descending by compositeScore', () => {
  const signals = [
    { source: 'A', topic: 'low', strength: 0.1, timestampISO: '2026-08-10' },
    { source: 'A', topic: 'high', strength: 0.9, timestampISO: '2026-08-10' },
  ];
  const result = fuseIntentSignals(signals, '2026-08-10');
  assert.strictEqual(result[0].topic, 'high');
  assert.strictEqual(result[1].topic, 'low');
});

console.log(`\n${passed}/14 passing`);
