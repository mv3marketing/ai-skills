'use strict';
const assert = require('assert');
const { calibrateWeights, scoreAccount, sigmoid } = require('./calibrator.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name} -> ${e.message}`);
    process.exitCode = 1;
  }
}

// 1. sigmoid basic properties
test('sigmoid(0) === 0.5', () => assert.strictEqual(sigmoid(0), 0.5));
test('sigmoid is bounded in [0,1] and saturates correctly at extremes', () => {
  assert.ok(sigmoid(50) <= 1 && sigmoid(50) > 0.999);
  assert.ok(sigmoid(-50) >= 0 && sigmoid(-50) < 0.001);
});
test('sigmoid is numerically stable for large negative input', () => {
  assert.ok(Number.isFinite(sigmoid(-1000)));
});

// 2. throws on too few rows
test('throws with fewer than 4 rows', () => {
  assert.throws(() => calibrateWeights([{ signals: { a: 1 }, churned: 0 }]));
});

// 3. throws on single-class dataset
test('throws when all rows share one outcome', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ signals: { usage: i }, churned: 0 }));
  assert.throws(() => calibrateWeights(rows), /only one outcome class/);
});

// 4. throws on non-numeric signal
test('throws on missing/non-numeric signal value', () => {
  const rows = [
    { signals: { usage: 5 }, churned: 0 },
    { signals: { usage: 'x' }, churned: 1 },
    { signals: { usage: 3 }, churned: 0 },
    { signals: { usage: 8 }, churned: 1 },
  ];
  assert.throws(() => calibrateWeights(rows), /numeric value/);
});

// 5. real signal, negative correlation with churn should produce a negative fitted weight
test('a strongly protective signal (high usage -> low churn) fits a negative weight', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const usage = Math.random() * 100;
    const churned = usage < 50 ? 1 : 0; // low usage -> churn
    rows.push({ signals: { usage }, churned });
  }
  const model = calibrateWeights(rows, { iterations: 1500 });
  assert.ok(model.weights.usage < 0, `expected negative weight, got ${model.weights.usage}`);
  assert.ok(model.accuracy > 0.75, `expected accuracy > 0.75, got ${model.accuracy}`);
});

// 6. a risk signal (support tickets) positively correlated with churn fits a positive weight
test('a risk signal (tickets -> churn) fits a positive weight', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const tickets = Math.floor(Math.random() * 10);
    const churned = tickets > 5 ? 1 : 0;
    rows.push({ signals: { tickets }, churned });
  }
  const model = calibrateWeights(rows, { iterations: 1500 });
  assert.ok(model.weights.tickets > 0, `expected positive weight, got ${model.weights.tickets}`);
});

// 7. scoreAccount returns 0-100 range
test('scoreAccount returns a value in [0,100]', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const usage = Math.random() * 100;
    rows.push({ signals: { usage }, churned: usage < 50 ? 1 : 0 });
  }
  const model = calibrateWeights(rows, { iterations: 1000 });
  const score = scoreAccount({ usage: 90 }, model);
  assert.ok(score >= 0 && score <= 100, `score out of range: ${score}`);
});

// 8. scoreAccount: healthy signals score higher than unhealthy signals on the same model
test('a healthier account scores higher than an unhealthy one', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const usage = Math.random() * 100;
    rows.push({ signals: { usage }, churned: usage < 50 ? 1 : 0 });
  }
  const model = calibrateWeights(rows, { iterations: 1500 });
  const healthyScore = scoreAccount({ usage: 95 }, model);
  const unhealthyScore = scoreAccount({ usage: 5 }, model);
  assert.ok(healthyScore > unhealthyScore, `expected ${healthyScore} > ${unhealthyScore}`);
});

// 9. scoreAccount throws on missing signal
test('scoreAccount throws when a required signal is missing', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    rows.push({ signals: { usage: i }, churned: i % 2 });
  }
  const model = calibrateWeights(rows, { iterations: 500 });
  assert.throws(() => scoreAccount({}, model), /Missing signal/);
});

// 10. multi-signal fit converges to reasonable log-loss on a clean synthetic case
test('multi-signal fit achieves reasonable log-loss on separable synthetic data', () => {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const usage = Math.random() * 100;
    const tickets = Math.floor(Math.random() * 10);
    const churnScore = -usage + tickets * 8;
    const churned = churnScore > 0 ? 1 : 0;
    rows.push({ signals: { usage, tickets }, churned });
  }
  const model = calibrateWeights(rows, { iterations: 2000 });
  assert.ok(model.logLoss < 0.6, `expected logLoss < 0.6, got ${model.logLoss}`);
});

// 11. deterministic given deterministic input (no randomness in the algorithm itself)
test('calibrateWeights is deterministic for identical input', () => {
  const rows = [
    { signals: { a: 1, b: 5 }, churned: 0 },
    { signals: { a: 2, b: 4 }, churned: 0 },
    { signals: { a: 8, b: 1 }, churned: 1 },
    { signals: { a: 9, b: 0 }, churned: 1 },
    { signals: { a: 1, b: 6 }, churned: 0 },
    { signals: { a: 7, b: 2 }, churned: 1 },
  ];
  const m1 = calibrateWeights(rows, { iterations: 500 });
  const m2 = calibrateWeights(rows, { iterations: 500 });
  assert.deepStrictEqual(m1.weights, m2.weights);
});

// 12. l2 regularization shrinks weights toward zero as l2 increases
test('higher L2 regularization shrinks fitted weight magnitudes', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const usage = Math.random() * 100;
    rows.push({ signals: { usage }, churned: usage < 50 ? 1 : 0 });
  }
  const lowReg = calibrateWeights(rows, { iterations: 1000, l2: 0.001 });
  const highReg = calibrateWeights(rows, { iterations: 1000, l2: 5 });
  assert.ok(Math.abs(highReg.weights.usage) < Math.abs(lowReg.weights.usage));
});

console.log(`\n${passed}/14 passing`);
