/**
 * Lifecycle Flow Gap Auditor
 * MV3 Marketing — Email / Automation skill
 *
 * Parses an exported lifecycle/workflow definition into a common graph
 * model, then finds real structural gaps via graph-reachability analysis:
 * unreachable nodes, dead-ends with no declared exit, and wait/delay steps
 * with no guaranteed timeout path — a customer could get stuck forever.
 */

'use strict';

/**
 * @typedef {{id: string, type: string, isTerminal?: boolean}} FlowNode
 * @typedef {{from: string, to: string, condition?: string, isDefault?: boolean}} FlowEdge
 * @typedef {{entryNodeId: string, nodes: FlowNode[], edges: FlowEdge[]}} Flow
 */

function validateFlow(flow) {
  if (!flow || typeof flow.entryNodeId !== 'string') throw new Error('flow.entryNodeId (string) is required.');
  if (!Array.isArray(flow.nodes) || flow.nodes.length === 0) throw new Error('flow.nodes must be a non-empty array.');
  if (!Array.isArray(flow.edges)) throw new Error('flow.edges must be an array.');

  const ids = new Set(flow.nodes.map((n) => n.id));
  if (!ids.has(flow.entryNodeId)) throw new Error(`entryNodeId "${flow.entryNodeId}" is not a node in flow.nodes.`);
  for (const e of flow.edges) {
    if (!ids.has(e.from)) throw new Error(`Edge references unknown "from" node "${e.from}".`);
    if (!ids.has(e.to)) throw new Error(`Edge references unknown "to" node "${e.to}".`);
  }
}

function buildAdjacency(flow) {
  const outgoing = new Map(flow.nodes.map((n) => [n.id, []]));
  for (const e of flow.edges) outgoing.get(e.from).push(e);
  return outgoing;
}

function reachableFrom(entryNodeId, outgoing) {
  const visited = new Set([entryNodeId]);
  const queue = [entryNodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const edge of outgoing.get(current) || []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return visited;
}

const WAIT_TYPES = new Set(['wait', 'delay', 'timer']);

/**
 * @param {Flow} flow
 * @returns {{unreachableNodes: string[], deadEnds: string[], missingExitTriggers: string[]}}
 */
function auditFlow(flow) {
  validateFlow(flow);

  const outgoing = buildAdjacency(flow);
  const reachable = reachableFrom(flow.entryNodeId, outgoing);

  const unreachableNodes = flow.nodes
    .filter((n) => n.id !== flow.entryNodeId && !reachable.has(n.id))
    .map((n) => n.id);

  const deadEnds = flow.nodes
    .filter((n) => reachable.has(n.id) && !n.isTerminal && outgoing.get(n.id).length === 0)
    .map((n) => n.id);

  const missingExitTriggers = flow.nodes
    .filter((n) => reachable.has(n.id) && WAIT_TYPES.has(n.type))
    .filter((n) => {
      const edges = outgoing.get(n.id);
      if (edges.length === 0) return false; // already caught as a dead-end
      return !edges.some((e) => e.isDefault === true || e.condition === 'timeout');
    })
    .map((n) => n.id);

  return { unreachableNodes, deadEnds, missingExitTriggers };
}

module.exports = { auditFlow, reachableFrom, validateFlow };
