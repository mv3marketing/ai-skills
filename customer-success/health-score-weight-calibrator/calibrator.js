/**
 * Health-Score Weight Calibrator
 * MV3 Marketing — Customer Success / Retention skill
 *
 * Statistically fits per-signal weights against real renewal/churn outcomes
 * using L2-regularized logistic regression (gradient descent, zero deps),
 * instead of hand-guessing weights in a config UI.
 *
 * Input: an array of accounts, each with { signals: {name: number, ...}, churned: 0|1 }
 * Output: { weights: {name: number}, intercept, iterations, logLoss, accuracy }
 */

'use strict';

function sigmoid(z) {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function zScoreNormalize(rows, signalNames) {
  const stats = {};
  for (const name of signalNames) {
    const vals = rows.map((r) => r.signals[name] ?? 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance) || 1; // avoid div-by-zero for constant signals
    stats[name] = { mean, std };
  }
  return stats;
}

/**
 * Fits logistic regression weights via batch gradient descent with L2 regularization.
 * @param {Array<{signals: Object<string, number>, churned: 0|1}>} rows
 * @param {Object} [opts]
 * @param {number} [opts.learningRate=0.1]
 * @param {number} [opts.iterations=2000]
 * @param {number} [opts.l2=0.01]
 * @returns {{weights: Object<string, number>, intercept: number, iterations: number, logLoss: number, accuracy: number, signalStats: Object}}
 */
function calibrateWeights(rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length < 4) {
    throw new Error('calibrateWeights requires at least 4 account rows to fit against.');
  }
  const outcomes = rows.map((r) => r.churned);
  if (!outcomes.every((o) => o === 0 || o === 1)) {
    throw new Error('Every row.churned must be 0 or 1.');
  }
  const uniqueOutcomes = new Set(outcomes);
  if (uniqueOutcomes.size < 2) {
    throw new Error('Cannot calibrate against a dataset with only one outcome class (all churned or all retained). Real churn/renewal variance is required.');
  }

  const signalNames = Object.keys(rows[0].signals);
  for (const r of rows) {
    for (const name of signalNames) {
      if (typeof r.signals[name] !== 'number' || Number.isNaN(r.signals[name])) {
        throw new Error(`Row missing numeric value for signal "${name}".`);
      }
    }
  }

  const { learningRate = 0.1, iterations = 2000, l2 = 0.01 } = opts;

  const signalStats = zScoreNormalize(rows, signalNames);
  const X = rows.map((r) => signalNames.map((name) => (r.signals[name] - signalStats[name].mean) / signalStats[name].std));
  const y = outcomes;
  const n = X.length;
  const d = signalNames.length;

  let w = new Array(d).fill(0);
  let b = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      const z = X[i].reduce((sum, x, j) => sum + x * w[j], b);
      const pred = sigmoid(z);
      const error = pred - y[i];
      for (let j = 0; j < d; j++) gradW[j] += error * X[i][j];
      gradB += error;
    }

    for (let j = 0; j < d; j++) {
      w[j] -= learningRate * (gradW[j] / n + l2 * w[j]);
    }
    b -= learningRate * (gradB / n);
  }

  let logLoss = 0;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const z = X[i].reduce((sum, x, j) => sum + x * w[j], b);
    const pred = sigmoid(z);
    const clamped = Math.min(Math.max(pred, 1e-9), 1 - 1e-9);
    logLoss += -(y[i] * Math.log(clamped) + (1 - y[i]) * Math.log(1 - clamped));
    if ((pred >= 0.5 ? 1 : 0) === y[i]) correct++;
  }
  logLoss /= n;

  const weights = {};
  signalNames.forEach((name, j) => { weights[name] = Number(w[j].toFixed(6)); });

  return {
    weights,
    intercept: Number(b.toFixed(6)),
    iterations,
    logLoss: Number(logLoss.toFixed(6)),
    accuracy: Number((correct / n).toFixed(4)),
    signalStats,
  };
}

/**
 * Scores a single account's raw signals against a fitted model, returning
 * a 0-100 health score (100 = healthiest / lowest churn risk).
 */
function scoreAccount(signals, model) {
  const signalNames = Object.keys(model.weights);
  let z = model.intercept;
  for (const name of signalNames) {
    const raw = signals[name];
    if (typeof raw !== 'number') throw new Error(`Missing signal "${name}" for scoring.`);
    const stats = model.signalStats[name];
    const normalized = (raw - stats.mean) / stats.std;
    z += normalized * model.weights[name];
  }
  const churnProb = sigmoid(z);
  return Number((100 * (1 - churnProb)).toFixed(1));
}

module.exports = { calibrateWeights, scoreAccount, sigmoid };
