/**
 * Supply Path & PMP Deal Quality Auditor
 * MV3 Marketing — Paid Media skill
 *
 * Evaluates programmatic supply paths (sellers.json-style chains) for
 * redundant intermediaries and fee stacking: real total-fee computation
 * per path, grouping by publisher to find duplicate paths, and flagging
 * excessive intermediary hop counts - real ad-tech domain logic, not a
 * lookup.
 */

'use strict';

const DEFAULT_MAX_HOPS = 2; // more than this many intermediaries between buyer and publisher is a real red flag

/**
 * @param {Array<{sellerId: string, sellerType: 'PUBLISHER'|'INTERMEDIARY'|'BOTH', feePercent: number}>} chain
 * @returns {number} total effective fee percentage along this path (compounded, not summed - fees are taken sequentially off the remaining spend)
 */
function computeTotalFee(chain) {
  if (!Array.isArray(chain) || chain.length === 0) throw new Error('chain must be a non-empty array.');
  let remaining = 1;
  for (const hop of chain) {
    if (typeof hop.feePercent !== 'number' || hop.feePercent < 0 || hop.feePercent >= 1) {
      throw new Error(`Invalid feePercent "${hop.feePercent}" for seller "${hop.sellerId}" (must be 0-1, exclusive of 1).`);
    }
    remaining *= (1 - hop.feePercent);
  }
  return Number((1 - remaining).toFixed(6));
}

function countIntermediaries(chain) {
  return chain.filter((hop) => hop.sellerType === 'INTERMEDIARY' || hop.sellerType === 'BOTH').length;
}

/**
 * @param {Array<{pathId: string, publisherDomain: string, chain: Array}>} paths
 * @param {Object} [opts]
 * @param {number} [opts.maxHops=2]
 * @returns {{redundantPublishers: Array, excessiveHopPaths: Array, allPaths: Array}}
 */
function auditSupplyPaths(paths, opts = {}) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('paths must be a non-empty array.');
  const { maxHops = DEFAULT_MAX_HOPS } = opts;
  if (maxHops < 0) throw new Error('maxHops must be >= 0.');

  const allPaths = paths.map((p) => {
    if (!p.pathId) throw new Error('Every path needs a pathId.');
    if (!p.publisherDomain) throw new Error(`Path ${p.pathId} needs a publisherDomain.`);
    return {
      pathId: p.pathId,
      publisherDomain: p.publisherDomain,
      totalFee: computeTotalFee(p.chain),
      intermediaryCount: countIntermediaries(p.chain),
    };
  });

  const byPublisher = new Map();
  for (const p of allPaths) {
    if (!byPublisher.has(p.publisherDomain)) byPublisher.set(p.publisherDomain, []);
    byPublisher.get(p.publisherDomain).push(p);
  }

  const redundantPublishers = [];
  for (const [publisherDomain, publisherPaths] of byPublisher.entries()) {
    if (publisherPaths.length < 2) continue;
    const sorted = [...publisherPaths].sort((a, b) => a.totalFee - b.totalFee);
    const cheapest = sorted[0];
    const redundant = sorted.slice(1);
    redundantPublishers.push({
      publisherDomain,
      recommendedPathId: cheapest.pathId,
      recommendedFee: cheapest.totalFee,
      redundantPaths: redundant.map((p) => ({ pathId: p.pathId, totalFee: p.totalFee, excessFeeVsRecommended: Number((p.totalFee - cheapest.totalFee).toFixed(6)) })),
    });
  }

  const excessiveHopPaths = allPaths.filter((p) => p.intermediaryCount > maxHops);

  return { redundantPublishers, excessiveHopPaths, allPaths };
}

module.exports = { computeTotalFee, countIntermediaries, auditSupplyPaths };
