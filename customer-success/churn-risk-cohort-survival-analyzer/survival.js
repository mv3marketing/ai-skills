/**
 * Churn Risk Cohort Survival Analyzer
 * MV3 Marketing — Customer Success skill
 *
 * Computes real customer retention curves using the Kaplan-Meier
 * product-limit estimator, the standard survival-analysis method for
 * time-to-event data with censoring. This is a genuinely different
 * problem from a health-score model (see the separate
 * health-score-weight-calibrator skill): a health score predicts an
 * individual customer's risk today, while survival analysis answers "what
 * fraction of customers like this one are still active after N days,"
 * correctly accounting for customers who haven't churned YET (censored
 * observations) instead of either dropping them or wrongly counting them
 * as retained forever.
 */

'use strict';

/**
 * @param {Array<{customerId: string, tenureDays: number, churned: boolean}>} customers
 * @returns {Array<{tenureDays: number, atRisk: number, events: number, survivalProbability: number}>}
 */
function computeKaplanMeierCurve(customers) {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error('customers must be a non-empty array.');
  }
  for (const c of customers) {
    if (typeof c.tenureDays !== 'number' || c.tenureDays < 0) {
      throw new Error(`Customer ${c.customerId}: tenureDays must be a non-negative number.`);
    }
    if (typeof c.churned !== 'boolean') {
      throw new Error(`Customer ${c.customerId}: churned must be a boolean.`);
    }
  }

  const eventTimes = [...new Set(customers.filter((c) => c.churned).map((c) => c.tenureDays))].sort((a, b) => a - b);

  let survival = 1;
  const curve = [];
  for (const t of eventTimes) {
    const atRisk = customers.filter((c) => c.tenureDays >= t).length;
    const events = customers.filter((c) => c.churned && c.tenureDays === t).length;
    // atRisk is guaranteed >= 1 here since t itself came from a customer's
    // own tenureDays, but guard anyway for defensive correctness.
    if (atRisk === 0) throw new Error(`Internal inconsistency: no customers at risk at t=${t}.`);
    survival = survival * (1 - events / atRisk);
    curve.push({ tenureDays: t, atRisk, events, survivalProbability: Number(survival.toFixed(6)) });
  }

  return curve;
}

/**
 * The first tenure day at which survival probability drops to 0.5 or
 * below -- the conventional definition of median survival time. Returns
 * null if the curve never reaches 50% (common, and honestly reported
 * rather than extrapolated).
 * @param {Array<{tenureDays: number, survivalProbability: number}>} curve
 * @returns {number|null}
 */
function computeMedianSurvivalTime(curve) {
  if (!Array.isArray(curve)) throw new Error('curve must be an array.');
  const point = curve.find((p) => p.survivalProbability <= 0.5);
  return point ? point.tenureDays : null;
}

/**
 * Groups customers by cohort and returns a Kaplan-Meier curve per cohort,
 * for comparing retention across e.g. signup month or plan tier.
 * @param {Array<{customerId: string, cohort: string, tenureDays: number, churned: boolean}>} customers
 * @returns {Object<string, {curve: Array<Object>, medianSurvivalTime: number|null, customerCount: number}>}
 */
function compareCohortSurvival(customers) {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error('customers must be a non-empty array.');
  }
  const byCohort = {};
  for (const c of customers) {
    if (!c.cohort) throw new Error(`Customer ${c.customerId} is missing a cohort.`);
    if (!byCohort[c.cohort]) byCohort[c.cohort] = [];
    byCohort[c.cohort].push(c);
  }

  const results = {};
  for (const [cohort, cohortCustomers] of Object.entries(byCohort)) {
    const curve = computeKaplanMeierCurve(cohortCustomers);
    results[cohort] = {
      curve,
      medianSurvivalTime: computeMedianSurvivalTime(curve),
      customerCount: cohortCustomers.length,
    };
  }
  return results;
}

module.exports = {
  computeKaplanMeierCurve,
  computeMedianSurvivalTime,
  compareCohortSurvival,
};
