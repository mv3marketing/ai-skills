'use strict';
const assert = require('assert');
const { computePageRank, sequenceBuild } = require('./sequencer.js');

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

function approxEqual(a, b, eps = 0.001) {
  assert.ok(Math.abs(a - b) < eps, `expected ~${b}, got ${a}`);
}

test('throws on empty nodeIds', () => {
  assert.throws(() => computePageRank([], []));
});

test('throws when an edge references an unknown node', () => {
  assert.throws(() => computePageRank(['a', 'b'], [{ from: 'a', to: 'ghost' }]));
});

test('throws on invalid damping factor', () => {
  assert.throws(() => computePageRank(['a', 'b'], [], { damping: 1.5 }));
});

test('a symmetric 3-node cycle converges to equal rank for all nodes', () => {
  const nodes = ['a', 'b', 'c'];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'a' },
  ];
  const rank = computePageRank(nodes, edges);
  approxEqual(rank.a, 1 / 3, 0.01);
  approxEqual(rank.b, 1 / 3, 0.01);
  approxEqual(rank.c, 1 / 3, 0.01);
});

test('ranks always sum to approximately 1 (a real property of PageRank)', () => {
  const nodes = ['a', 'b', 'c', 'd'];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'c', to: 'd' },
    { from: 'd', to: 'a' },
  ];
  const rank = computePageRank(nodes, edges);
  const total = Object.values(rank).reduce((s, v) => s + v, 0);
  approxEqual(total, 1, 0.01);
});

test('a hub-and-spoke: the page linked to by everyone else outranks a leaf page', () => {
  const nodes = ['hub', 'a', 'b', 'c'];
  const edges = [
    { from: 'a', to: 'hub' },
    { from: 'b', to: 'hub' },
    { from: 'c', to: 'hub' },
    { from: 'hub', to: 'a' },
  ];
  const rank = computePageRank(nodes, edges);
  assert.ok(rank.hub > rank.b);
  assert.ok(rank.hub > rank.c);
});

test('a dangling node (no outgoing links) does not break the computation (rank still sums to ~1)', () => {
  const nodes = ['a', 'b', 'dead-end'];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'dead-end' },
  ];
  const rank = computePageRank(nodes, edges);
  const total = Object.values(rank).reduce((s, v) => s + v, 0);
  approxEqual(total, 1, 0.02);
});

test('a heavier-weighted edge transfers proportionally more rank than a lighter one', () => {
  const nodes = ['source', 'strong', 'weak'];
  const edges = [
    { from: 'source', to: 'strong', weight: 9 },
    { from: 'source', to: 'weak', weight: 1 },
    { from: 'strong', to: 'source' },
    { from: 'weak', to: 'source' },
  ];
  const rank = computePageRank(nodes, edges);
  assert.ok(rank.strong > rank.weak);
});

// --- sequenceBuild ---
test('sequenceBuild throws on empty builtPageIds', () => {
  assert.throws(() => sequenceBuild([], ['x'], []));
});

test('sequenceBuild throws on empty unbuiltPageIds', () => {
  assert.throws(() => sequenceBuild(['a'], [], []));
});

test('sequenceBuild ranks an unbuilt page linked from a high-authority built page above one linked from a low-authority page', () => {
  const built = ['pillar', 'weak-page'];
  const unbuilt = ['candidate-a', 'candidate-b'];
  const edges = [
    // pillar is a real hub - lots of internal pages point to it
    { from: 'weak-page', to: 'pillar' },
    { from: 'candidate-a', to: 'pillar' },
    { from: 'candidate-b', to: 'pillar' },
    // planned links from built pages into the not-yet-built candidates
    { from: 'pillar', to: 'candidate-a' },
    { from: 'weak-page', to: 'candidate-b' },
  ];
  const sequence = sequenceBuild(built, unbuilt, edges);
  assert.strictEqual(sequence[0].pageId, 'candidate-a');
});

test('sequenceBuild results are sorted descending by incoming equity', () => {
  const built = ['pillar'];
  const unbuilt = ['a', 'b', 'c'];
  const edges = [
    { from: 'a', to: 'pillar' },
    { from: 'b', to: 'pillar' },
    { from: 'c', to: 'pillar' },
    { from: 'pillar', to: 'a', weight: 5 },
    { from: 'pillar', to: 'b', weight: 1 },
  ];
  const sequence = sequenceBuild(built, unbuilt, edges);
  for (let i = 1; i < sequence.length; i++) {
    assert.ok(sequence[i - 1].incomingEquityFromBuilt >= sequence[i].incomingEquityFromBuilt);
  }
  assert.strictEqual(sequence[sequence.length - 1].pageId, 'c'); // no incoming link at all -> last
});

console.log(`\n${passed}/12 passing`);
