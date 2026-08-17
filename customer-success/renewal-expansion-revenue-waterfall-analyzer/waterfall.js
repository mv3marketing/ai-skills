/**
 * Renewal & Expansion Revenue Waterfall Analyzer
 * MV3 Marketing — Customer Success skill
 *
 * Builds a real ARR (annual recurring revenue) waterfall bridge from
 * account-level previous/current ARR, and computes Net Revenue Retention
 * (NRR) and Gross Revenue Retention (GRR) using their standard SaaS
 * metric definitions. Two real problems this solves:
 *
 *   1. Classifying each account's change (new / expansion / contraction /
 *      churned / flat) by hand is error-prone and inconsistent across
 *      analysts. This applies one deterministic rule per account.
 *   2. NRR and GRR are frequently confused or miscalculated (e.g.
 *      including new-logo ARR in the retention base, which artificially
 *      inflates the number). This implements the standard, distinct
 *      definitions: NRR includes expansion but excludes new logos; GRR
 *      excludes expansion entirely and can never exceed 100%.
 */

'use strict';

/**
 * @param {number} previousARR
 * @param {number} currentARR
 * @returns {'new'|'expansion'|'contraction'|'churned'|'flat'}
 */
function classifyAccountChange(previousARR, currentARR) {
  if (typeof previousARR !== 'number' || previousARR < 0) throw new Error('previousARR must be a non-negative number.');
  if (typeof currentARR !== 'number' || currentARR < 0) throw new Error('currentARR must be a non-negative number.');

  if (previousARR === 0 && currentARR > 0) return 'new';
  if (previousARR > 0 && currentARR === 0) return 'churned';
  if (previousARR === 0 && currentARR === 0) return 'flat';
  if (currentARR > previousARR) return 'expansion';
  if (currentARR < previousARR) return 'contraction';
  return 'flat';
}

/**
 * @param {Array<{accountId: string, previousARR: number, currentARR: number}>} accounts
 * @returns {{beginningARR: number, newARR: number, expansionARR: number, contractionARR: number, churnedARR: number, endingARR: number, nrr: number, grr: number, byAccount: Array<Object>}}
 */
function buildRevenueWaterfall(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('accounts must be a non-empty array.');
  }

  let beginningARR = 0;
  let newARR = 0;
  let expansionARR = 0;
  let contractionARR = 0; // stored as a positive number representing lost ARR
  let churnedARR = 0;

  const byAccount = accounts.map((account) => {
    if (!account.accountId) throw new Error('Every account must have an accountId.');
    const classification = classifyAccountChange(account.previousARR, account.currentARR);

    beginningARR += account.previousARR;

    switch (classification) {
      case 'new':
        newARR += account.currentARR;
        break;
      case 'expansion':
        expansionARR += account.currentARR - account.previousARR;
        break;
      case 'contraction':
        contractionARR += account.previousARR - account.currentARR;
        break;
      case 'churned':
        churnedARR += account.previousARR;
        break;
      // 'flat' contributes nothing to any bucket
    }

    return { accountId: account.accountId, previousARR: account.previousARR, currentARR: account.currentARR, classification };
  });

  const endingARR = Number((beginningARR + newARR + expansionARR - contractionARR - churnedARR).toFixed(2));

  if (beginningARR === 0) {
    throw new Error('beginningARR is 0 -- NRR/GRR are undefined with no existing revenue base (every account is "new"). Report new-logo ARR separately instead.');
  }

  // NRR includes expansion, excludes new-logo ARR (the standard definition).
  const nrr = Number(((beginningARR + expansionARR - contractionARR - churnedARR) / beginningARR).toFixed(4));
  // GRR excludes expansion entirely -- structurally can never exceed 1.0.
  const grr = Number(((beginningARR - contractionARR - churnedARR) / beginningARR).toFixed(4));

  return {
    beginningARR: Number(beginningARR.toFixed(2)),
    newARR: Number(newARR.toFixed(2)),
    expansionARR: Number(expansionARR.toFixed(2)),
    contractionARR: Number(contractionARR.toFixed(2)),
    churnedARR: Number(churnedARR.toFixed(2)),
    endingARR,
    nrr,
    grr,
    byAccount,
  };
}

module.exports = {
  classifyAccountChange,
  buildRevenueWaterfall,
};
