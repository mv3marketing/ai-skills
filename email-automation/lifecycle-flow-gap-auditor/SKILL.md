---
name: lifecycle-flow-gap-auditor
description: Parses an exported lifecycle/workflow definition into a common graph model, then finds unreachable nodes, dead-ends with no declared exit, and wait/delay steps with no guaranteed timeout path via real graph-reachability analysis. Use when auditing an ESP/marketing-automation flow (Klaviyo, ActiveCampaign, HubSpot, Marketo) for customers who can get stuck.
---

# Lifecycle Flow Gap Auditor

A customer stuck forever in a "wait for reply" step with no timeout branch is invisible in
most flow-builder UIs — it looks like a normal step, not a bug. This skill parses your flow
into a graph and finds these gaps with real reachability analysis, not a visual scan.

## What this is (and isn't)

An audit function over a flow definition you supply in a common graph shape, not a hosted
service or a direct ESP integration. You export/convert your flow to `{entryNodeId, nodes,
edges}` first; this skill audits that graph.

## Files

| File | Purpose |
|---|---|
| `auditor.js` | `auditFlow()`, plus exported `reachableFrom()`/`validateFlow()` — zero dependencies |
| `test.js` | 12-test suite covering reachability, dead-ends, and missing-exit-trigger detection |

## How to use it

```js
const { auditFlow } = require('./auditor.js');

const flow = {
  entryNodeId: 'signup',
  nodes: [
    { id: 'signup', type: 'trigger' },
    { id: 'wait3d', type: 'wait' },
    { id: 'end', type: 'exit', isTerminal: true },
  ],
  edges: [
    { from: 'signup', to: 'wait3d' },
    { from: 'wait3d', to: 'end', condition: 'clicked' }, // no timeout/default branch - a real gap
  ],
};

const result = auditFlow(flow);
// result.unreachableNodes -> nodes with no path from entry
// result.deadEnds -> reachable, non-terminal nodes with zero outgoing edges
// result.missingExitTriggers -> wait/delay nodes with no guaranteed timeout/default branch
```

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real ESP so flow exports are pulled and audited automatically.
