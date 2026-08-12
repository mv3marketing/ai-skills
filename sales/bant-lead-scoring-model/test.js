/**
 * Real test: builds a synthetic historical-deals dataset with a KNOWN ground
 * truth (budget_confirmed strongly predicts wins, timeline_days is noise),
 * then asserts the calibration engine actually recovers that ranking from
 * the data — not just that it runs without crashing.
 */
const { calibrateWeights, pointBiserial } = require('./calibrate.js');

let failures = 0, passed = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`PASS [${label}]`); passed++; }
  else { console.error(`FAIL [${label}]${detail ? ' — ' + detail : ''}`); failures++; }
}

// Build 40 synthetic deals. budget_confirmed is the strong signal (deals with
// confirmed budget win 90% of the time; without, only 10%). timeline_days is
// pure noise (random, uncorrelated with outcome) by design.
const deals = [];
let seedState = 42;
function seededRandom() { // deterministic PRNG so the test is reproducible, not flaky
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
for (let i = 0; i < 40; i++) {
  const budget_confirmed = seededRandom() < 0.5;
  const win_prob = budget_confirmed ? 0.9 : 0.1;
  const closed_won = seededRandom() < win_prob;
  deals.push({
    budget_confirmed,
    authority_level: seededRandom() < 0.5 ? 'decision_maker' : 'unknown', // mild signal, not tied to outcome here
    need_severity: Math.floor(seededRandom() * 10) + 1, // no relationship to outcome
    timeline_days: Math.floor(seededRandom() * 300), // pure noise
    closed_won,
  });
}

const result = calibrateWeights(deals);

check('sample_size matches input', result.sample_size === 40, `got ${result.sample_size}`);
check('warning present for <30... wait 40>=30, should be undefined', result.warning === undefined, `got ${result.warning}`);
check('budget_confirmed correlation is strongly positive (it IS the planted signal)', result.correlations.budget_confirmed > 0.5, `got ${result.correlations.budget_confirmed}`);
check('budget_confirmed has the highest weight of all 4 signals', result.weights.budget_confirmed === Math.max(...Object.values(result.weights)), `weights: ${JSON.stringify(result.weights)}`);

const weightSum = Object.values(result.weights).reduce((a, b) => a + b, 0);
check('weights sum to ~12 (matches the snippet\'s point scale)', Math.abs(weightSum - 12) < 0.5, `sum=${weightSum}`);

// Small-sample warning test
const smallResult = calibrateWeights(deals.slice(0, 10));
check('warns on small sample size (<30 deals)', typeof smallResult.warning === 'string', 'expected a warning string');

// Zero-correlation fallback test — construct a dataset with a 50/50 coin-flip
// outcome regardless of the signal, so all correlations round to ~0.
const flatDeals = [];
for (let i = 0; i < 40; i++) {
  flatDeals.push({ budget_confirmed: i % 2 === 0, authority_level: 'unknown', need_severity: 5, timeline_days: 90, closed_won: i % 3 === 0 });
}
// need_severity and timeline_days are CONSTANT here, so their stddev is 0 —
// pointBiserial must return 0, not NaN or throw.
const flatResult = calibrateWeights(flatDeals);
check('constant-value signals produce 0 correlation, not NaN', !Number.isNaN(flatResult.correlations.need_severity) && flatResult.correlations.need_severity === 0, `got ${flatResult.correlations.need_severity}`);

// Input validation
let threw = false;
try { calibrateWeights([]); } catch (e) { threw = true; }
check('empty array throws instead of silently returning garbage', threw);

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
