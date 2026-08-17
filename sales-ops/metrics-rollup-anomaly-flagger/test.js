'use strict';
const assert = require('assert');
const { median, medianAbsoluteDeviation, normalizeReplyRate, normalizeOpenRate, rollupMetrics, detectAnomalies, DEFAULT_MODIFIED_Z_THRESHOLD } = require('./flagger.js');

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

// --- median ---
test('median of an even-length array averages the two middle values', () => {
  assert.strictEqual(median([1, 2, 3, 4]), 2.5);
});

test('median of an odd-length array is the middle value', () => {
  assert.strictEqual(median([5, 1, 3]), 3);
});

test('throws on an empty array', () => {
  assert.throws(() => median([]));
});

// --- medianAbsoluteDeviation ---
test('computes MAD correctly against a known hand-verified case', () => {
  // values [1,2,3,4,5], median=3, deviations=[2,1,0,1,2], median of those = 1
  assert.strictEqual(medianAbsoluteDeviation([1, 2, 3, 4, 5]), 1);
});

test('MAD is zero when every value is identical', () => {
  assert.strictEqual(medianAbsoluteDeviation([7, 7, 7, 7]), 0);
});

// --- normalizeReplyRate ---
test('excludes auto-replies before computing the rate', () => {
  const result = normalizeReplyRate(50, 1000, 10);
  assert.strictEqual(result.genuineReplies, 40);
  assert.strictEqual(result.rate, 0.04);
});

test('defaults autoReplies to 0 when omitted', () => {
  const result = normalizeReplyRate(30, 1000);
  assert.strictEqual(result.genuineReplies, 30);
});

test('throws when autoReplies exceeds rawReplies', () => {
  assert.throws(() => normalizeReplyRate(5, 1000, 10));
});

test('throws on non-positive sent', () => {
  assert.throws(() => normalizeReplyRate(5, 0, 0));
});

// --- normalizeOpenRate ---
test('a non-MPP-affected platform is marked reliable with no caveat', () => {
  const result = normalizeOpenRate(300, 1000, false);
  assert.strictEqual(result.rate, 0.3);
  assert.strictEqual(result.reliable, true);
  assert.strictEqual(result.reason, null);
});

test('an MPP-affected platform is marked unreliable with a real caveat, not silently corrected', () => {
  const result = normalizeOpenRate(300, 1000, true);
  assert.strictEqual(result.rate, 0.3);
  assert.strictEqual(result.reliable, false);
  assert.ok(result.reason.includes('Mail Privacy Protection'));
});

test('mppAffected defaults to false', () => {
  const result = normalizeOpenRate(100, 1000);
  assert.strictEqual(result.reliable, true);
});

// --- rollupMetrics ---
test('sums totalSent and blends reply rate across platforms using genuine replies', () => {
  const result = rollupMetrics([
    { platform: 'Outreach', sent: 1000, opens: 300, replies: 50, autoReplies: 10 },
    { platform: 'Salesloft', sent: 500, opens: 150, replies: 20, autoReplies: 0 },
  ]);
  assert.strictEqual(result.totalSent, 1500);
  // genuine replies: 40 + 20 = 60, over 1500 sent = 0.04
  assert.strictEqual(result.blendedReplyRate, 0.04);
});

test('flags anyUnreliableOpenRates true when at least one platform is MPP-affected', () => {
  const result = rollupMetrics([
    { platform: 'Outreach', sent: 1000, opens: 300, replies: 50, mppAffected: true },
    { platform: 'Salesloft', sent: 500, opens: 150, replies: 20, mppAffected: false },
  ]);
  assert.strictEqual(result.anyUnreliableOpenRates, true);
  assert.strictEqual(result.byPlatform[0].openRateReliable, false);
  assert.strictEqual(result.byPlatform[1].openRateReliable, true);
});

test('anyUnreliableOpenRates is false when no platform is MPP-affected', () => {
  const result = rollupMetrics([{ platform: 'Outreach', sent: 1000, opens: 300, replies: 50 }]);
  assert.strictEqual(result.anyUnreliableOpenRates, false);
});

test('throws on an empty platformReports array', () => {
  assert.throws(() => rollupMetrics([]));
});

test('throws when a platform report is missing a platform name', () => {
  assert.throws(() => rollupMetrics([{ sent: 1000, opens: 300, replies: 50 }]));
});

// --- detectAnomalies ---
test('the first minBaselinePoints entries are marked insufficientBaseline, not flagged', () => {
  const series = [1, 2, 3, 4].map((v, i) => ({ period: `p${i}`, value: v }));
  const result = detectAnomalies(series, { minBaselinePoints: 5 });
  assert.ok(result.every((r) => r.insufficientBaseline === true && r.isAnomaly === false));
});

test('a stable series with a genuine spike flags the spike, not the stable points', () => {
  const series = [10, 12, 11, 9, 13, 100].map((v, i) => ({ period: `p${i}`, value: v }));
  const result = detectAnomalies(series, { minBaselinePoints: 5 });
  assert.strictEqual(result[5].isAnomaly, true);
  assert.strictEqual(result[5].value, 100);
});

test('hand-verified modified z-score on a known baseline', () => {
  // baseline [10,12,11,9,13] -> median=11, MAD=1; point value=11 -> z = 0.6745*(11-11)/1 = 0
  const series = [10, 12, 11, 9, 13, 11].map((v, i) => ({ period: `p${i}`, value: v }));
  const result = detectAnomalies(series, { minBaselinePoints: 5 });
  assert.strictEqual(result[5].modifiedZ, 0);
  assert.strictEqual(result[5].isAnomaly, false);
});

test('a zero-MAD baseline (identical values) flags any deviation as an infinite-magnitude anomaly', () => {
  const series = [10, 10, 10, 10, 10, 15].map((v, i) => ({ period: `p${i}`, value: v }));
  const result = detectAnomalies(series, { minBaselinePoints: 5 });
  assert.strictEqual(result[5].modifiedZ, Infinity);
  assert.strictEqual(result[5].isAnomaly, true);
});

test('a zero-MAD baseline with a matching value is not flagged', () => {
  const series = [10, 10, 10, 10, 10, 10].map((v, i) => ({ period: `p${i}`, value: v }));
  const result = detectAnomalies(series, { minBaselinePoints: 5 });
  assert.strictEqual(result[5].modifiedZ, 0);
  assert.strictEqual(result[5].isAnomaly, false);
});

test('a custom threshold changes anomaly sensitivity', () => {
  const series = [10, 12, 11, 9, 13, 20].map((v, i) => ({ period: `p${i}`, value: v }));
  const strict = detectAnomalies(series, { minBaselinePoints: 5, threshold: 1 });
  const lenient = detectAnomalies(series, { minBaselinePoints: 5, threshold: 100 });
  assert.strictEqual(strict[5].isAnomaly, true);
  assert.strictEqual(lenient[5].isAnomaly, false);
});

test('throws on an empty series', () => {
  assert.throws(() => detectAnomalies([]));
});

test('throws on a non-positive threshold', () => {
  const series = [1, 2, 3, 4, 5, 6].map((v, i) => ({ period: `p${i}`, value: v }));
  assert.throws(() => detectAnomalies(series, { threshold: 0 }));
});

test('DEFAULT_MODIFIED_Z_THRESHOLD is the documented Iglewicz & Hoaglin constant', () => {
  assert.strictEqual(DEFAULT_MODIFIED_Z_THRESHOLD, 3.5);
});

console.log(`\n${passed}/${total} passing`);
