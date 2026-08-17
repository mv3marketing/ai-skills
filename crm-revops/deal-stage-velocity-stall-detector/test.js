'use strict';
const assert = require('assert');
const { percentile, computeStageBenchmarks, evaluateDealStall, projectExpectedCloseDate } = require('./detector.js');

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name} -> ${e.message}`);
    process.exitCode = 1;
  }
}

function makeDeal(dealId, stage, days, exited = true) {
  const enteredAt = '2026-01-01T00:00:00Z';
  const exitedAt = exited ? new Date(new Date(enteredAt).getTime() + days * 86400000).toISOString() : null;
  return { dealId, stageHistory: [{ stage, enteredAt, exitedAt }] };
}

// --- percentile ---
test('hand-verified: median of an odd-length sorted array', () => {
  assert.strictEqual(percentile([1, 2, 3, 4, 5], 0.5), 3);
});

test('hand-verified: Q1 of a 5-element array with linear interpolation', () => {
  assert.strictEqual(percentile([1, 2, 3, 4, 5], 0.25), 2);
});

test('hand-verified: Q1 of a 4-element array requires interpolation', () => {
  assert.strictEqual(percentile([1, 2, 3, 4], 0.25), 1.75);
});

test('hand-verified: Q3 of a 4-element array requires interpolation', () => {
  assert.strictEqual(percentile([1, 2, 3, 4], 0.75), 3.25);
});

test('a single-value array returns that value at any percentile', () => {
  assert.strictEqual(percentile([42], 0.9), 42);
});

test('throws on an out-of-range percentile', () => {
  assert.throws(() => percentile([1, 2, 3], 1.5));
});

// --- computeStageBenchmarks ---
test('hand-verified benchmark computation on a known 6-value sample', () => {
  // Evaluation durations: [10,12,11,9,13,14] -> sorted [9,10,11,12,13,14]
  const deals = [10, 12, 11, 9, 13, 14].map((d, i) => makeDeal(`d${i}`, 'Evaluation', d));
  const benchmarks = computeStageBenchmarks(deals, { minSampleSize: 5 });
  assert.strictEqual(benchmarks.Evaluation.median, 11.5);
  assert.strictEqual(benchmarks.Evaluation.q1, 10.25);
  assert.strictEqual(benchmarks.Evaluation.q3, 12.75);
  assert.strictEqual(benchmarks.Evaluation.stallThresholdDays, 16.5);
  assert.strictEqual(benchmarks.Evaluation.sampleSize, 6);
});

test('a stage with fewer than minSampleSize durations is marked insufficientSample', () => {
  const deals = [10, 12].map((d, i) => makeDeal(`d${i}`, 'Legal', d));
  const benchmarks = computeStageBenchmarks(deals, { minSampleSize: 5 });
  assert.strictEqual(benchmarks.Legal.insufficientSample, true);
  assert.strictEqual(benchmarks.Legal.median, null);
});

test('open stage visits (exitedAt null) are excluded from the benchmark', () => {
  const deals = [makeDeal('d1', 'Evaluation', 10), makeDeal('d2', 'Evaluation', 12), makeDeal('d3', 'Evaluation', 5, false)];
  const benchmarks = computeStageBenchmarks(deals, { minSampleSize: 2 });
  assert.strictEqual(benchmarks.Evaluation.sampleSize, 2);
});

test('throws when exitedAt precedes enteredAt', () => {
  const badDeal = { dealId: 'bad', stageHistory: [{ stage: 'X', enteredAt: '2026-02-01', exitedAt: '2026-01-01' }] };
  assert.throws(() => computeStageBenchmarks([badDeal]));
});

test('throws on an empty historicalDeals array', () => {
  assert.throws(() => computeStageBenchmarks([]));
});

// --- evaluateDealStall ---
test('a deal well within the stage benchmark is not stalled', () => {
  const deals = [10, 12, 11, 9, 13, 14].map((d, i) => makeDeal(`d${i}`, 'Evaluation', d));
  const benchmarks = computeStageBenchmarks(deals, { minSampleSize: 5 });
  const result = evaluateDealStall(
    { dealId: 'open1', currentStage: 'Evaluation', enteredCurrentStageAt: '2026-03-01T00:00:00Z' },
    benchmarks,
    '2026-03-05T00:00:00Z' // 4 days in, well under the 16.5-day threshold
  );
  assert.strictEqual(result.isStalled, false);
  assert.strictEqual(result.insufficientBenchmark, false);
});

test('a deal past the stall threshold is flagged stalled', () => {
  const deals = [10, 12, 11, 9, 13, 14].map((d, i) => makeDeal(`d${i}`, 'Evaluation', d));
  const benchmarks = computeStageBenchmarks(deals, { minSampleSize: 5 });
  const result = evaluateDealStall(
    { dealId: 'open2', currentStage: 'Evaluation', enteredCurrentStageAt: '2026-01-01T00:00:00Z' },
    benchmarks,
    '2026-01-25T00:00:00Z' // 24 days, over the 16.5-day threshold
  );
  assert.strictEqual(result.isStalled, true);
});

test('a stage with no benchmark data is flagged insufficientBenchmark, not silently passed', () => {
  const result = evaluateDealStall(
    { dealId: 'open3', currentStage: 'NeverSeenStage', enteredCurrentStageAt: '2026-01-01T00:00:00Z' },
    {},
    '2026-02-01T00:00:00Z'
  );
  assert.strictEqual(result.insufficientBenchmark, true);
  assert.strictEqual(result.isStalled, false);
});

test('throws when enteredCurrentStageAt is in the future relative to now', () => {
  assert.throws(() =>
    evaluateDealStall({ dealId: 'x', currentStage: 'Evaluation', enteredCurrentStageAt: '2026-06-01' }, {}, '2026-01-01')
  );
});

test('throws when required deal fields are missing', () => {
  assert.throws(() => evaluateDealStall({ dealId: 'x' }, {}));
});

// --- projectExpectedCloseDate ---
test('sums median durations of remaining stages to project a close date', () => {
  const evalDeals = [10, 12, 11, 9, 13, 14].map((d, i) => makeDeal(`e${i}`, 'Evaluation', d));
  const legalDeals = [5, 6, 7, 5, 6].map((d, i) => makeDeal(`l${i}`, 'Legal', d));
  const benchmarks = computeStageBenchmarks([...evalDeals, ...legalDeals], { minSampleSize: 5 });
  const result = projectExpectedCloseDate({ dealId: 'open1' }, ['Evaluation', 'Legal'], benchmarks, '2026-01-01T00:00:00Z');
  // Evaluation median 11.5 + Legal median 6 = 17.5 days
  assert.strictEqual(result.daysRemaining, 17.5);
  assert.strictEqual(result.stagesWithoutBenchmark.length, 0);
});

test('a remaining stage with no benchmark is flagged, not guessed at', () => {
  const evalDeals = [10, 12, 11, 9, 13, 14].map((d, i) => makeDeal(`e${i}`, 'Evaluation', d));
  const benchmarks = computeStageBenchmarks(evalDeals, { minSampleSize: 5 });
  const result = projectExpectedCloseDate({ dealId: 'open1' }, ['Evaluation', 'NeverSeenStage'], benchmarks, '2026-01-01T00:00:00Z');
  assert.deepStrictEqual(result.stagesWithoutBenchmark, ['NeverSeenStage']);
  assert.strictEqual(result.daysRemaining, 11.5); // only Evaluation contributes
});

test('an empty remaining-stages list projects a zero-day close', () => {
  const result = projectExpectedCloseDate({ dealId: 'open1' }, [], {}, '2026-01-01T00:00:00Z');
  assert.strictEqual(result.daysRemaining, 0);
  assert.strictEqual(result.projectedCloseDate, '2026-01-01');
});

console.log(`\n${passed}/${total} passing`);
