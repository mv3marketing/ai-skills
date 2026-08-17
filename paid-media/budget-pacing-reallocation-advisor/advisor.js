/**
 * Budget Pacing & Reallocation Advisor
 * MV3 Marketing — Paid Media skill
 *
 * Recommends specific dollar budget moves with a real guardrail against
 * learning-phase resets: most ad platforms treat a budget change above
 * ~20% (or any change within days of the last one) as significant enough
 * to reset the campaign's learning phase, tanking performance temporarily.
 * This skill enforces both real limits, not just "shift budget to
 * winners."
 */

'use strict';

const DEFAULT_MAX_CHANGE_PERCENT = 0.2; // most platforms reset learning phase above ~20%
const DEFAULT_LEARNING_PHASE_COOLDOWN_DAYS = 7;

/**
 * @param {number} spendToDate
 * @param {number} targetSpend
 * @param {number} daysElapsed
 * @param {number} totalDaysInPeriod
 * @returns {{expectedSpendToDate: number, paceRatio: number, status: 'under_pacing'|'on_pace'|'over_pacing'}}
 */
function computePacingStatus(spendToDate, targetSpend, daysElapsed, totalDaysInPeriod) {
  if (targetSpend <= 0) throw new Error('targetSpend must be > 0.');
  if (totalDaysInPeriod <= 0) throw new Error('totalDaysInPeriod must be > 0.');
  if (daysElapsed < 0 || daysElapsed > totalDaysInPeriod) throw new Error('daysElapsed must be between 0 and totalDaysInPeriod.');

  const expectedSpendToDate = targetSpend * (daysElapsed / totalDaysInPeriod);
  const paceRatio = expectedSpendToDate === 0 ? 1 : spendToDate / expectedSpendToDate;

  let status;
  if (paceRatio < 0.9) status = 'under_pacing';
  else if (paceRatio > 1.1) status = 'over_pacing';
  else status = 'on_pace';

  return { expectedSpendToDate: Number(expectedSpendToDate.toFixed(2)), paceRatio: Number(paceRatio.toFixed(3)), status };
}

/**
 * @param {Object} campaign
 * @param {string} campaign.campaignId
 * @param {number} campaign.currentDailyBudget
 * @param {number} campaign.performanceScore - e.g. actual ROAS / target ROAS, or target CPA / actual CPA - 1.0 = exactly on target, >1 = beating target
 * @param {number} campaign.daysSinceLastBudgetChange
 * @param {Object} [opts]
 * @param {number} [opts.maxChangePercent=0.2]
 * @param {number} [opts.learningPhaseCooldownDays=7]
 * @returns {{campaignId: string, action: 'hold'|'increase'|'decrease', recommendedDailyBudget: number, changePercent: number, reason: string}}
 */
function recommendBudgetChange(campaign, opts = {}) {
  const { campaignId, currentDailyBudget, performanceScore, daysSinceLastBudgetChange } = campaign;
  if (!campaignId) throw new Error('campaign.campaignId is required.');
  if (typeof currentDailyBudget !== 'number' || currentDailyBudget <= 0) throw new Error('campaign.currentDailyBudget must be a positive number.');
  if (typeof performanceScore !== 'number' || performanceScore < 0) throw new Error('campaign.performanceScore must be a non-negative number.');
  if (typeof daysSinceLastBudgetChange !== 'number' || daysSinceLastBudgetChange < 0) throw new Error('campaign.daysSinceLastBudgetChange must be a non-negative number.');

  const { maxChangePercent = DEFAULT_MAX_CHANGE_PERCENT, learningPhaseCooldownDays = DEFAULT_LEARNING_PHASE_COOLDOWN_DAYS } = opts;
  if (maxChangePercent <= 0 || maxChangePercent >= 1) throw new Error('maxChangePercent must be between 0 and 1.');
  if (learningPhaseCooldownDays < 0) throw new Error('learningPhaseCooldownDays must be >= 0.');

  if (daysSinceLastBudgetChange < learningPhaseCooldownDays) {
    return {
      campaignId,
      action: 'hold',
      recommendedDailyBudget: currentDailyBudget,
      changePercent: 0,
      reason: `Budget changed ${daysSinceLastBudgetChange} day(s) ago, within the ${learningPhaseCooldownDays}-day learning-phase cooldown. Changing again now risks resetting the algorithm's learning phase.`,
    };
  }

  // performanceScore of 1.0 = on target; scale the desired change by how far
  // off target performance is, capped at maxChangePercent either direction.
  const rawDesiredChange = performanceScore - 1;
  const cappedChange = Math.max(-maxChangePercent, Math.min(maxChangePercent, rawDesiredChange));

  if (Math.abs(cappedChange) < 0.01) {
    return {
      campaignId,
      action: 'hold',
      recommendedDailyBudget: currentDailyBudget,
      changePercent: 0,
      reason: `Performance is close to target (score ${performanceScore.toFixed(2)}). No budget change recommended.`,
    };
  }

  const recommendedDailyBudget = Number((currentDailyBudget * (1 + cappedChange)).toFixed(2));
  const action = cappedChange > 0 ? 'increase' : 'decrease';
  const wasClamped = Math.abs(rawDesiredChange) > maxChangePercent;

  return {
    campaignId,
    action,
    recommendedDailyBudget,
    changePercent: Number(cappedChange.toFixed(4)),
    reason: wasClamped
      ? `Performance score ${performanceScore.toFixed(2)} suggests a larger move, but the change is capped at ${(maxChangePercent * 100).toFixed(0)}% to avoid a learning-phase reset.`
      : `Performance score ${performanceScore.toFixed(2)} supports a ${(Math.abs(cappedChange) * 100).toFixed(0)}% ${action}.`,
  };
}

module.exports = { computePacingStatus, recommendBudgetChange, DEFAULT_MAX_CHANGE_PERCENT, DEFAULT_LEARNING_PHASE_COOLDOWN_DAYS };
