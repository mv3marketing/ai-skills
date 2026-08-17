/**
 * Deal Stage Velocity & Stall Detector
 * MV3 Marketing — CRM & RevOps skill
 *
 * Flags deals stalled in their current pipeline stage using real
 * per-stage historical benchmarks, not a single arbitrary "days in
 * stage" threshold applied to every deal alike. Two real problems this
 * solves:
 *
 *   1. Different stages have genuinely different normal durations (an
 *      Evaluation stage might normally run 3x longer than a Contracting
 *      stage) -- a single sitewide "flag if >14 days in stage" rule
 *      either misses slow-moving-but-normal stages or over-flags
 *      naturally-longer ones.
 *   2. A stalled-deal threshold based on the mean/stdev of historical
 *      stage durations is itself distorted by prior stalled deals in the
 *      training data. This uses quartiles and Tukey's IQR outlier fence
 *      (Q3 + 1.5*IQR) -- a robust, standard method unaffected by a
 *      handful of extreme values in the benchmark set.
 */

'use strict';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Linear-interpolation percentile, the same method used by default in
 * most statistics libraries (e.g. NumPy's default 'linear' method).
 * @param {number[]} sortedValues - must already be sorted ascending
 * @param {number} p - 0..1
 * @returns {number}
 */
function percentile(sortedValues, p) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) throw new Error('sortedValues must be a non-empty array.');
  if (p < 0 || p > 1) throw new Error('p must be between 0 and 1.');
  if (sortedValues.length === 1) return sortedValues[0];

  const rank = p * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];

  const fraction = rank - lowerIndex;
  return sortedValues[lowerIndex] + fraction * (sortedValues[upperIndex] - sortedValues[lowerIndex]);
}

/**
 * Builds per-stage duration benchmarks from historical CLOSED deals'
 * complete stage histories.
 * @param {Array<{dealId: string, stageHistory: Array<{stage: string, enteredAt: string, exitedAt: string}>}>} historicalDeals
 * @param {Object} [opts]
 * @param {number} [opts.minSampleSize=5]
 * @returns {Object<string, {median: number, q1: number, q3: number, stallThresholdDays: number, sampleSize: number, insufficientSample: boolean}>}
 */
function computeStageBenchmarks(historicalDeals, opts = {}) {
  if (!Array.isArray(historicalDeals) || historicalDeals.length === 0) {
    throw new Error('historicalDeals must be a non-empty array.');
  }
  const { minSampleSize = 5 } = opts;

  const durationsByStage = {};
  for (const deal of historicalDeals) {
    for (const entry of deal.stageHistory) {
      if (!entry.exitedAt) continue; // only completed stage visits contribute to the benchmark
      const days = (new Date(entry.exitedAt) - new Date(entry.enteredAt)) / MS_PER_DAY;
      if (days < 0) throw new Error(`Deal ${deal.dealId}: stage "${entry.stage}" has exitedAt before enteredAt.`);
      if (!durationsByStage[entry.stage]) durationsByStage[entry.stage] = [];
      durationsByStage[entry.stage].push(days);
    }
  }

  const benchmarks = {};
  for (const [stage, durations] of Object.entries(durationsByStage)) {
    const sorted = [...durations].sort((a, b) => a - b);
    const sampleSize = sorted.length;
    const insufficientSample = sampleSize < minSampleSize;

    if (insufficientSample) {
      benchmarks[stage] = { median: null, q1: null, q3: null, stallThresholdDays: null, sampleSize, insufficientSample: true };
      continue;
    }

    const q1 = percentile(sorted, 0.25);
    const median = percentile(sorted, 0.5);
    const q3 = percentile(sorted, 0.75);
    const iqr = q3 - q1;
    // Tukey's outlier fence: standard, robust, not an invented constant.
    const stallThresholdDays = Number((q3 + 1.5 * iqr).toFixed(2));

    benchmarks[stage] = { median: Number(median.toFixed(2)), q1: Number(q1.toFixed(2)), q3: Number(q3.toFixed(2)), stallThresholdDays, sampleSize, insufficientSample: false };
  }

  return benchmarks;
}

/**
 * Evaluates whether an open deal is stalled in its current stage relative
 * to that stage's historical benchmark.
 * @param {{dealId: string, currentStage: string, enteredCurrentStageAt: string}} deal
 * @param {Object} benchmarks - output of computeStageBenchmarks()
 * @param {string} [now] - ISO date; defaults to the current time if omitted
 * @returns {{dealId: string, currentStage: string, daysInStage: number, isStalled: boolean, insufficientBenchmark: boolean, benchmark: Object|null}}
 */
function evaluateDealStall(deal, benchmarks, now) {
  if (!deal || !deal.dealId || !deal.currentStage || !deal.enteredCurrentStageAt) {
    throw new Error('deal must have dealId, currentStage, and enteredCurrentStageAt.');
  }
  const nowDate = now ? new Date(now) : new Date();
  const enteredDate = new Date(deal.enteredCurrentStageAt);
  if (isNaN(enteredDate.getTime())) throw new Error(`Invalid enteredCurrentStageAt for deal ${deal.dealId}.`);
  const daysInStage = Number(((nowDate - enteredDate) / MS_PER_DAY).toFixed(2));
  if (daysInStage < 0) throw new Error(`Deal ${deal.dealId}: enteredCurrentStageAt is in the future relative to "now".`);

  const benchmark = benchmarks[deal.currentStage];
  if (!benchmark || benchmark.insufficientSample) {
    return { dealId: deal.dealId, currentStage: deal.currentStage, daysInStage, isStalled: false, insufficientBenchmark: true, benchmark: benchmark || null };
  }

  return {
    dealId: deal.dealId,
    currentStage: deal.currentStage,
    daysInStage,
    isStalled: daysInStage > benchmark.stallThresholdDays,
    insufficientBenchmark: false,
    benchmark,
  };
}

/**
 * Projects an expected close date for an open deal by summing the median
 * benchmark duration of every stage still ahead of it in the pipeline.
 * @param {{dealId: string, currentStage: string, enteredCurrentStageAt: string}} deal
 * @param {string[]} remainingStagesInOrder - stages after the current one, in pipeline order (current stage itself excluded)
 * @param {Object} benchmarks
 * @param {string} [now]
 * @returns {{dealId: string, projectedCloseDate: string, daysRemaining: number, stagesWithoutBenchmark: string[]}}
 */
function projectExpectedCloseDate(deal, remainingStagesInOrder, benchmarks, now) {
  if (!Array.isArray(remainingStagesInOrder)) throw new Error('remainingStagesInOrder must be an array.');
  const nowDate = now ? new Date(now) : new Date();

  let daysRemaining = 0;
  const stagesWithoutBenchmark = [];
  for (const stage of remainingStagesInOrder) {
    const benchmark = benchmarks[stage];
    if (!benchmark || benchmark.insufficientSample) {
      stagesWithoutBenchmark.push(stage);
      continue; // cannot contribute a real number; flagged rather than guessed
    }
    daysRemaining += benchmark.median;
  }

  const projected = new Date(nowDate.getTime() + daysRemaining * MS_PER_DAY);
  return {
    dealId: deal.dealId,
    projectedCloseDate: projected.toISOString().slice(0, 10),
    daysRemaining: Number(daysRemaining.toFixed(2)),
    stagesWithoutBenchmark,
  };
}

module.exports = {
  percentile,
  computeStageBenchmarks,
  evaluateDealStall,
  projectExpectedCloseDate,
};
