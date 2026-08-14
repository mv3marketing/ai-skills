/**
 * CRM Pipeline Hygiene Auditor
 * MV3 Marketing — CRM / RevOps skill
 *
 * Flags stale deals (against per-stage-velocity thresholds, not a fixed day
 * count), missing required fields, fuzzy-match duplicate deals, and
 * stage-skip anomalies — output as a single prioritized cleanup list.
 */

'use strict';

/**
 * Levenshtein edit distance, zero dependencies.
 */
function levenshtein(a, b) {
  a = String(a).toLowerCase().trim();
  b = String(b).toLowerCase().trim();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(String(a).length, String(b).length) || 1;
  return 1 - dist / maxLen;
}

/**
 * @param {Array<Object>} deals - each: { id, name, company, stage, daysInStage, requiredFields: {...}, stageHistory: [stageIndex, ...] }
 * @param {Object} config
 * @param {string[]} config.stageOrder - ordered list of valid stage names, index 0 = earliest
 * @param {Object<string, number>} config.stageVelocityMedianDays - median days-in-stage per stage, from your own historical data
 * @param {string[]} config.requiredFields - field names that must be present/truthy on every deal
 * @param {number} [config.staleMultiplier=2] - a deal is stale once daysInStage exceeds median * this multiplier
 * @param {number} [config.dupeSimilarityThreshold=0.85] - 0-1 similarity above which two deal names are flagged as possible dupes
 * @returns {{ staleDeals: Array, missingFieldDeals: Array, possibleDupes: Array, stageSkipDeals: Array, prioritized: Array }}
 */
function auditPipeline(deals, config) {
  if (!Array.isArray(deals)) throw new Error('deals must be an array.');
  if (!config || !Array.isArray(config.stageOrder) || config.stageOrder.length === 0) {
    throw new Error('config.stageOrder must be a non-empty array.');
  }
  if (!config.stageVelocityMedianDays) throw new Error('config.stageVelocityMedianDays is required.');
  if (!Array.isArray(config.requiredFields)) throw new Error('config.requiredFields must be an array.');

  const staleMultiplier = config.staleMultiplier ?? 2;
  const dupeSimilarityThreshold = config.dupeSimilarityThreshold ?? 0.85;

  const staleDeals = [];
  const missingFieldDeals = [];
  const stageSkipDeals = [];

  for (const deal of deals) {
    if (!deal.id) throw new Error('Every deal must have an id.');
    if (typeof deal.stage !== 'string' || !config.stageOrder.includes(deal.stage)) {
      throw new Error(`Deal ${deal.id} has an unknown stage "${deal.stage}".`);
    }

    // 1. Staleness against per-stage-velocity threshold, not a fixed day count
    const median = config.stageVelocityMedianDays[deal.stage];
    if (typeof median === 'number' && typeof deal.daysInStage === 'number') {
      const threshold = median * staleMultiplier;
      if (deal.daysInStage > threshold) {
        staleDeals.push({ id: deal.id, name: deal.name, stage: deal.stage, daysInStage: deal.daysInStage, threshold: Number(threshold.toFixed(1)) });
      }
    }

    // 2. Missing required fields
    const missing = config.requiredFields.filter((f) => {
      const val = deal.requiredFields ? deal.requiredFields[f] : undefined;
      return val === undefined || val === null || val === '';
    });
    if (missing.length > 0) {
      missingFieldDeals.push({ id: deal.id, name: deal.name, missingFields: missing });
    }

    // 3. Stage-skip anomalies: consecutive stageHistory indices should never jump by more than 1
    if (Array.isArray(deal.stageHistory) && deal.stageHistory.length > 1) {
      for (let i = 1; i < deal.stageHistory.length; i++) {
        const jump = deal.stageHistory[i] - deal.stageHistory[i - 1];
        if (jump > 1) {
          stageSkipDeals.push({
            id: deal.id,
            name: deal.name,
            from: config.stageOrder[deal.stageHistory[i - 1]],
            to: config.stageOrder[deal.stageHistory[i]],
            stagesSkipped: jump - 1,
          });
          break;
        }
      }
    }
  }

  // 4. Fuzzy-match duplicate detection across all deal pairs, by name+company
  const possibleDupes = [];
  for (let i = 0; i < deals.length; i++) {
    for (let j = i + 1; j < deals.length; j++) {
      const a = deals[i];
      const b = deals[j];
      const nameSim = similarity(a.name || '', b.name || '');
      const companySim = similarity(a.company || '', b.company || '');
      const combined = (nameSim + companySim) / 2;
      if (combined >= dupeSimilarityThreshold) {
        possibleDupes.push({ dealA: a.id, dealB: b.id, nameA: a.name, nameB: b.name, similarity: Number(combined.toFixed(3)) });
      }
    }
  }

  const prioritized = [
    ...stageSkipDeals.map((d) => ({ ...d, issue: 'stage_skip', severity: 3 })),
    ...possibleDupes.map((d) => ({ ...d, issue: 'possible_duplicate', severity: 3 })),
    ...staleDeals.map((d) => ({ ...d, issue: 'stale', severity: 2 })),
    ...missingFieldDeals.map((d) => ({ ...d, issue: 'missing_fields', severity: 1 })),
  ].sort((a, b) => b.severity - a.severity);

  return { staleDeals, missingFieldDeals, possibleDupes, stageSkipDeals, prioritized };
}

module.exports = { auditPipeline, levenshtein, similarity };
