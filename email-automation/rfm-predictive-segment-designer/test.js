'use strict';
const assert = require('assert');
const { quintileScore, scoreCustomers, labelSegment } = require('./segmenter.js');

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

test('quintileScore throws on empty array', () => {
  assert.throws(() => quintileScore([], true));
});

test('quintileScore: higherIsBetter=true gives the highest value a score of 5', () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const scores = quintileScore(values, true);
  assert.strictEqual(scores[9], 5); // value 100, highest
  assert.strictEqual(scores[0], 1); // value 10, lowest
});

test('quintileScore: higherIsBetter=false inverts the mapping (lowest value scores 5)', () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]; // e.g. days-since-purchase, lower is better
  const scores = quintileScore(values, false);
  assert.strictEqual(scores[0], 5); // value 10 (fewest days) -> best score
  assert.strictEqual(scores[9], 1); // value 100 (most days) -> worst score
});

test('quintileScore produces an even 2-2-2-2-2 split for 10 evenly-spaced values', () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const scores = quintileScore(values, true);
  const counts = [0, 0, 0, 0, 0, 0];
  for (const s of scores) counts[s]++;
  assert.deepStrictEqual(counts.slice(1), [2, 2, 2, 2, 2]);
});

test('quintileScore preserves original array order in its output', () => {
  const values = [100, 10, 50];
  const scores = quintileScore(values, true);
  assert.ok(scores[0] > scores[1]); // 100 scores higher than 10
});

// --- labelSegment ---
test('labelSegment: high R, high avgScore -> Champions', () => {
  assert.strictEqual(labelSegment(5, 5, 5, 5), 'Champions');
});

test('labelSegment: high R, low F -> New / Promising', () => {
  assert.strictEqual(labelSegment(5, 1, 3, 3), 'New / Promising');
});

test('labelSegment: low R, moderate-high avgScore -> At Risk', () => {
  assert.strictEqual(labelSegment(1, 5, 5, 3.67), 'At Risk');
});

test('labelSegment: low R, low avgScore -> Lost', () => {
  assert.strictEqual(labelSegment(1, 1, 1, 1), 'Lost');
});

test('labelSegment: mid-range everything -> Core', () => {
  assert.strictEqual(labelSegment(3, 3, 3, 3), 'Core');
});

// --- scoreCustomers (integration) ---
test('scoreCustomers throws with fewer than 5 customers', () => {
  assert.throws(() => scoreCustomers([{ id: 'a', daysSinceLastPurchase: 1, purchaseCount: 1, totalSpend: 1 }]));
});

test('scoreCustomers throws on a customer missing a numeric field', () => {
  const customers = [
    { id: 'a', daysSinceLastPurchase: 1, purchaseCount: 1, totalSpend: 1 },
    { id: 'b', daysSinceLastPurchase: 2, purchaseCount: 2, totalSpend: 2 },
    { id: 'c', daysSinceLastPurchase: 3, purchaseCount: 3 }, // missing totalSpend
    { id: 'd', daysSinceLastPurchase: 4, purchaseCount: 4, totalSpend: 4 },
    { id: 'e', daysSinceLastPurchase: 5, purchaseCount: 5, totalSpend: 5 },
  ];
  assert.throws(() => scoreCustomers(customers), /missing a numeric/);
});

test('scoreCustomers: a recent, frequent, high-spend customer scores as Champions', () => {
  const customers = [
    { id: 'champion', daysSinceLastPurchase: 1, purchaseCount: 50, totalSpend: 5000 },
    { id: 'b', daysSinceLastPurchase: 100, purchaseCount: 10, totalSpend: 500 },
    { id: 'c', daysSinceLastPurchase: 200, purchaseCount: 5, totalSpend: 200 },
    { id: 'd', daysSinceLastPurchase: 300, purchaseCount: 2, totalSpend: 100 },
    { id: 'e', daysSinceLastPurchase: 400, purchaseCount: 1, totalSpend: 50 },
    { id: 'f', daysSinceLastPurchase: 500, purchaseCount: 1, totalSpend: 30 },
  ];
  const result = scoreCustomers(customers);
  const champion = result.find((r) => r.id === 'champion');
  assert.strictEqual(champion.segment, 'Champions');
});

test('scoreCustomers: a long-inactive, previously-frequent customer scores as At Risk or Lost', () => {
  const customers = [
    { id: 'atrisk', daysSinceLastPurchase: 500, purchaseCount: 40, totalSpend: 4000 }, // was great, now long gone
    { id: 'b', daysSinceLastPurchase: 1, purchaseCount: 10, totalSpend: 500 },
    { id: 'c', daysSinceLastPurchase: 5, purchaseCount: 5, totalSpend: 200 },
    { id: 'd', daysSinceLastPurchase: 10, purchaseCount: 2, totalSpend: 100 },
    { id: 'e', daysSinceLastPurchase: 20, purchaseCount: 1, totalSpend: 50 },
    { id: 'f', daysSinceLastPurchase: 30, purchaseCount: 1, totalSpend: 30 },
  ];
  const result = scoreCustomers(customers);
  const atRisk = result.find((r) => r.id === 'atrisk');
  assert.ok(atRisk.r <= 2, 'expected low recency score for a long-inactive customer');
  assert.ok(['At Risk', 'Lost'].includes(atRisk.segment), `expected At Risk or Lost, got ${atRisk.segment}`);
});

console.log(`\n${passed}/13 passing`);
