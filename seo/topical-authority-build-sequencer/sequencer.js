/**
 * Topical Authority Build-Sequencer
 * MV3 Marketing — SEO / GEO / Content skill
 *
 * Models the site as a weighted directed link graph and runs a real
 * iterative PageRank computation (Google's original algorithm, zero
 * dependencies) to find equity flow - then sequences which not-yet-built
 * page to build next based on how much internal equity it would actually
 * receive from ALREADY-BUILT pages, not just search volume.
 */

'use strict';

const DEFAULT_DAMPING = 0.85;
const DEFAULT_ITERATIONS = 50;
const DEFAULT_EPSILON = 1e-6;

/**
 * @param {string[]} nodeIds
 * @param {Array<{from: string, to: string, weight?: number}>} edges
 * @param {Object} [opts]
 * @returns {Object<string, number>} pageId -> PageRank score (sums to 1 across all nodes)
 */
function computePageRank(nodeIds, edges, opts = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) throw new Error('nodeIds must be a non-empty array.');
  if (!Array.isArray(edges)) throw new Error('edges must be an array.');
  const nodeSet = new Set(nodeIds);
  for (const e of edges) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) throw new Error(`Edge references a node not in nodeIds: ${e.from} -> ${e.to}`);
  }

  const { damping = DEFAULT_DAMPING, iterations = DEFAULT_ITERATIONS, epsilon = DEFAULT_EPSILON } = opts;
  if (damping <= 0 || damping >= 1) throw new Error('damping must be between 0 and 1.');

  const n = nodeIds.length;
  const outgoing = new Map(nodeIds.map((id) => [id, []]));
  const outWeightTotal = new Map(nodeIds.map((id) => [id, 0]));
  for (const e of edges) {
    const w = e.weight ?? 1;
    outgoing.get(e.from).push({ to: e.to, weight: w });
    outWeightTotal.set(e.from, outWeightTotal.get(e.from) + w);
  }

  let rank = new Map(nodeIds.map((id) => [id, 1 / n]));

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map(nodeIds.map((id) => [id, (1 - damping) / n]));

    for (const id of nodeIds) {
      const outs = outgoing.get(id);
      const totalWeight = outWeightTotal.get(id);
      if (outs.length === 0 || totalWeight === 0) {
        // Dangling node: redistribute its rank evenly across all nodes (standard PageRank handling).
        const share = (damping * rank.get(id)) / n;
        for (const otherId of nodeIds) next.set(otherId, next.get(otherId) + share);
        continue;
      }
      for (const { to, weight } of outs) {
        const contribution = damping * rank.get(id) * (weight / totalWeight);
        next.set(to, next.get(to) + contribution);
      }
    }

    let delta = 0;
    for (const id of nodeIds) delta += Math.abs(next.get(id) - rank.get(id));
    rank = next;
    if (delta < epsilon) break;
  }

  const result = {};
  for (const id of nodeIds) result[id] = Number(rank.get(id).toFixed(6));
  return result;
}

/**
 * Sequences not-yet-built pages by how much internal equity they would
 * receive from already-built (already-authoritative) pages, so the page
 * needing the least new external backlink-building to become authoritative
 * gets built first, and strengthens the graph for what comes after it.
 *
 * @param {string[]} builtPageIds
 * @param {string[]} unbuiltPageIds
 * @param {Array<{from: string, to: string, weight?: number}>} plannedEdges - the FULL planned link graph, including edges from built pages to not-yet-built ones
 * @returns {Array<{pageId: string, incomingEquityFromBuilt: number}>} sorted descending
 */
function sequenceBuild(builtPageIds, unbuiltPageIds, plannedEdges) {
  if (!Array.isArray(builtPageIds) || builtPageIds.length === 0) throw new Error('builtPageIds must be a non-empty array.');
  if (!Array.isArray(unbuiltPageIds) || unbuiltPageIds.length === 0) throw new Error('unbuiltPageIds must be a non-empty array.');

  const allNodes = [...new Set([...builtPageIds, ...unbuiltPageIds])];
  const rank = computePageRank(allNodes, plannedEdges);
  const builtSet = new Set(builtPageIds);

  const equity = new Map(unbuiltPageIds.map((id) => [id, 0]));
  for (const e of plannedEdges) {
    if (builtSet.has(e.from) && equity.has(e.to)) {
      equity.set(e.to, equity.get(e.to) + rank[e.from] * (e.weight ?? 1));
    }
  }

  return unbuiltPageIds
    .map((pageId) => ({ pageId, incomingEquityFromBuilt: Number(equity.get(pageId).toFixed(6)) }))
    .sort((a, b) => b.incomingEquityFromBuilt - a.incomingEquityFromBuilt);
}

module.exports = { computePageRank, sequenceBuild };
