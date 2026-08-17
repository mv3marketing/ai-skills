'use strict';
const assert = require('assert');
const { computeTotalFee, countIntermediaries, auditSupplyPaths } = require('./auditor.js');

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

// --- computeTotalFee ---
test('throws on empty chain', () => {
  assert.throws(() => computeTotalFee([]));
});

test('throws on invalid feePercent', () => {
  assert.throws(() => computeTotalFee([{ sellerId: 'a', sellerType: 'PUBLISHER', feePercent: 1.5 }]));
});

test('a single-hop chain with no fee has 0 total fee', () => {
  assert.strictEqual(computeTotalFee([{ sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0 }]), 0);
});

test('two 10% fee hops compound to 19%, not a naive 20% sum', () => {
  const chain = [
    { sellerId: 'exchange-1', sellerType: 'INTERMEDIARY', feePercent: 0.1 },
    { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.1 },
  ];
  assert.strictEqual(computeTotalFee(chain), 0.19);
});

test('a longer chain with more hops has a higher total fee than a shorter one at the same per-hop rate', () => {
  const shortChain = [{ sellerId: 'a', sellerType: 'INTERMEDIARY', feePercent: 0.1 }, { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.1 }];
  const longChain = [
    { sellerId: 'a', sellerType: 'INTERMEDIARY', feePercent: 0.1 },
    { sellerId: 'b', sellerType: 'INTERMEDIARY', feePercent: 0.1 },
    { sellerId: 'c', sellerType: 'INTERMEDIARY', feePercent: 0.1 },
    { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.1 },
  ];
  assert.ok(computeTotalFee(longChain) > computeTotalFee(shortChain));
});

// --- countIntermediaries ---
test('counts INTERMEDIARY and BOTH types, excludes PUBLISHER-only', () => {
  const chain = [
    { sellerId: 'a', sellerType: 'INTERMEDIARY', feePercent: 0.05 },
    { sellerId: 'b', sellerType: 'BOTH', feePercent: 0.05 },
    { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.05 },
  ];
  assert.strictEqual(countIntermediaries(chain), 2);
});

// --- auditSupplyPaths ---
test('throws on empty paths array', () => {
  assert.throws(() => auditSupplyPaths([]));
});

test('throws when a path is missing publisherDomain', () => {
  assert.throws(() => auditSupplyPaths([{ pathId: 'a', chain: [{ sellerId: 'x', sellerType: 'PUBLISHER', feePercent: 0.1 }] }]));
});

test('identifies redundant paths to the same publisher and recommends the cheapest', () => {
  const paths = [
    { pathId: 'path-expensive', publisherDomain: 'example.com', chain: [{ sellerId: 'exchange-a', sellerType: 'INTERMEDIARY', feePercent: 0.15 }, { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.1 }] },
    { pathId: 'path-cheap', publisherDomain: 'example.com', chain: [{ sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.1 }] },
  ];
  const result = auditSupplyPaths(paths);
  assert.strictEqual(result.redundantPublishers.length, 1);
  assert.strictEqual(result.redundantPublishers[0].recommendedPathId, 'path-cheap');
  assert.strictEqual(result.redundantPublishers[0].redundantPaths[0].pathId, 'path-expensive');
  assert.ok(result.redundantPublishers[0].redundantPaths[0].excessFeeVsRecommended > 0);
});

test('does not flag a publisher reached by only one path', () => {
  const paths = [
    { pathId: 'a', publisherDomain: 'example.com', chain: [{ sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.1 }] },
    { pathId: 'b', publisherDomain: 'other.com', chain: [{ sellerId: 'pub2', sellerType: 'PUBLISHER', feePercent: 0.1 }] },
  ];
  const result = auditSupplyPaths(paths);
  assert.strictEqual(result.redundantPublishers.length, 0);
});

test('flags a path with more intermediary hops than maxHops', () => {
  const paths = [{
    pathId: 'deep-path',
    publisherDomain: 'example.com',
    chain: [
      { sellerId: 'a', sellerType: 'INTERMEDIARY', feePercent: 0.05 },
      { sellerId: 'b', sellerType: 'INTERMEDIARY', feePercent: 0.05 },
      { sellerId: 'c', sellerType: 'INTERMEDIARY', feePercent: 0.05 },
      { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.05 },
    ],
  }];
  const result = auditSupplyPaths(paths, { maxHops: 2 });
  assert.strictEqual(result.excessiveHopPaths.length, 1);
  assert.strictEqual(result.excessiveHopPaths[0].pathId, 'deep-path');
});

test('does not flag a path at or under maxHops', () => {
  const paths = [{
    pathId: 'ok-path',
    publisherDomain: 'example.com',
    chain: [{ sellerId: 'a', sellerType: 'INTERMEDIARY', feePercent: 0.05 }, { sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.05 }],
  }];
  const result = auditSupplyPaths(paths, { maxHops: 2 });
  assert.strictEqual(result.excessiveHopPaths.length, 0);
});

test('allPaths includes every path with computed fee and hop count', () => {
  const paths = [{ pathId: 'a', publisherDomain: 'example.com', chain: [{ sellerId: 'pub', sellerType: 'PUBLISHER', feePercent: 0.1 }] }];
  const result = auditSupplyPaths(paths);
  assert.strictEqual(result.allPaths.length, 1);
  assert.strictEqual(result.allPaths[0].totalFee, 0.1);
});

console.log(`\n${passed}/13 passing`);
