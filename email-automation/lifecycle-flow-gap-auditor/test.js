'use strict';
const assert = require('assert');
const { auditFlow } = require('./auditor.js');

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

test('throws on missing entryNodeId', () => {
  assert.throws(() => auditFlow({ nodes: [{ id: 'a' }], edges: [] }));
});

test('throws when entryNodeId is not in nodes', () => {
  assert.throws(() => auditFlow({ entryNodeId: 'z', nodes: [{ id: 'a' }], edges: [] }));
});

test('throws when an edge references an unknown node', () => {
  assert.throws(() => auditFlow({ entryNodeId: 'a', nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'ghost' }] }));
});

test('a clean linear flow with a terminal end has no gaps', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [{ id: 'start', type: 'email' }, { id: 'wait1', type: 'wait' }, { id: 'end', type: 'exit', isTerminal: true }],
    edges: [
      { from: 'start', to: 'wait1', isDefault: true },
      { from: 'wait1', to: 'end', condition: 'timeout' },
    ],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.unreachableNodes, []);
  assert.deepStrictEqual(result.deadEnds, []);
  assert.deepStrictEqual(result.missingExitTriggers, []);
});

test('detects an unreachable node with no incoming path from entry', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [{ id: 'start', type: 'email' }, { id: 'orphan', type: 'email' }],
    edges: [],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.unreachableNodes, ['orphan']);
});

test('detects a dead-end: reachable node with no outgoing edges and not marked terminal', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [{ id: 'start', type: 'email' }, { id: 'stuck', type: 'email' }],
    edges: [{ from: 'start', to: 'stuck' }],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.deadEnds, ['stuck']);
});

test('does not flag a reachable terminal node as a dead-end', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [{ id: 'start', type: 'email' }, { id: 'end', type: 'exit', isTerminal: true }],
    edges: [{ from: 'start', to: 'end' }],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.deadEnds, []);
});

test('detects a wait node with branches but no guaranteed timeout/default exit', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'email' },
      { id: 'wait1', type: 'wait' },
      { id: 'opened', type: 'email' },
    ],
    edges: [
      { from: 'start', to: 'wait1' },
      { from: 'wait1', to: 'opened', condition: 'opened_email' }, // conditional only, could stay false forever
    ],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.missingExitTriggers, ['wait1']);
});

test('does not flag a wait node whose branch includes an explicit timeout path', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'email' },
      { id: 'wait1', type: 'wait' },
      { id: 'opened', type: 'email' },
      { id: 'fallback', type: 'email' },
    ],
    edges: [
      { from: 'start', to: 'wait1' },
      { from: 'wait1', to: 'opened', condition: 'opened_email' },
      { from: 'wait1', to: 'fallback', condition: 'timeout' },
    ],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.missingExitTriggers, []);
});

test('a wait node with zero outgoing edges is caught as a dead-end, not double-counted as missing-exit-trigger', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [{ id: 'start', type: 'email' }, { id: 'wait1', type: 'wait' }],
    edges: [{ from: 'start', to: 'wait1' }],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.deadEnds, ['wait1']);
  assert.deepStrictEqual(result.missingExitTriggers, []);
});

test('unreachable nodes are not also flagged as dead-ends or missing-exit-triggers', () => {
  const flow = {
    entryNodeId: 'start',
    nodes: [
      { id: 'start', type: 'email' },
      { id: 'end', type: 'exit', isTerminal: true },
      { id: 'orphanWait', type: 'wait' }, // unreachable; would itself look like a dead-end (no outgoing edges) if it were reachable
    ],
    edges: [{ from: 'start', to: 'end' }],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.unreachableNodes, ['orphanWait']);
  assert.deepStrictEqual(result.deadEnds, []);
  assert.deepStrictEqual(result.missingExitTriggers, []);
});

test('handles a real multi-branch flow with one genuine gap among several clean paths', () => {
  const flow = {
    entryNodeId: 'signup',
    nodes: [
      { id: 'signup', type: 'trigger' },
      { id: 'welcome', type: 'email' },
      { id: 'wait3d', type: 'wait' },
      { id: 'engaged', type: 'email' },
      { id: 'unengaged', type: 'email' },
      { id: 'waitFinal', type: 'wait' }, // this one has the gap
      { id: 'end', type: 'exit', isTerminal: true },
    ],
    edges: [
      { from: 'signup', to: 'welcome' },
      { from: 'welcome', to: 'wait3d' },
      { from: 'wait3d', to: 'engaged', condition: 'clicked' },
      { from: 'wait3d', to: 'unengaged', condition: 'timeout' },
      { from: 'engaged', to: 'end' },
      { from: 'unengaged', to: 'waitFinal' },
      { from: 'waitFinal', to: 'end', condition: 'replied' }, // no timeout/default branch here
    ],
  };
  const result = auditFlow(flow);
  assert.deepStrictEqual(result.unreachableNodes, []);
  assert.deepStrictEqual(result.deadEnds, []);
  assert.deepStrictEqual(result.missingExitTriggers, ['waitFinal']);
});

console.log(`\n${passed}/12 passing`);
