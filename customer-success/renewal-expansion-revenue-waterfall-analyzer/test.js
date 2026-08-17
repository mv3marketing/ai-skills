'use strict';
const assert = require('assert');
const { classifyAccountChange, buildRevenueWaterfall } = require('./waterfall.js');

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

// --- classifyAccountChange ---
test('previousARR=0, currentARR>0 classifies as new', () => {
  assert.strictEqual(classifyAccountChange(0, 300), 'new');
});

test('previousARR>0, currentARR=0 classifies as churned', () => {
  assert.strictEqual(classifyAccountChange(800, 0), 'churned');
});

test('currentARR > previousARR classifies as expansion', () => {
  assert.strictEqual(classifyAccountChange(1000, 1200), 'expansion');
});

test('currentARR < previousARR (but > 0) classifies as contraction', () => {
  assert.strictEqual(classifyAccountChange(400, 250), 'contraction');
});

test('equal previousARR and currentARR classifies as flat', () => {
  assert.strictEqual(classifyAccountChange(500, 500), 'flat');
});

test('both zero classifies as flat', () => {
  assert.strictEqual(classifyAccountChange(0, 0), 'flat');
});

test('throws on a negative ARR value', () => {
  assert.throws(() => classifyAccountChange(-100, 200));
});

// --- buildRevenueWaterfall, hand-verified against a known 5-account example ---
const EXAMPLE_ACCOUNTS = [
  { accountId: 'A1', previousARR: 1000, currentARR: 1200 }, // expansion +200
  { accountId: 'A2', previousARR: 500, currentARR: 500 }, // flat
  { accountId: 'A3', previousARR: 800, currentARR: 0 }, // churned -800
  { accountId: 'A4', previousARR: 0, currentARR: 300 }, // new +300
  { accountId: 'A5', previousARR: 400, currentARR: 250 }, // contraction -150
];

test('hand-verified beginningARR excludes new-logo accounts', () => {
  const result = buildRevenueWaterfall(EXAMPLE_ACCOUNTS);
  assert.strictEqual(result.beginningARR, 2700);
});

test('hand-verified new/expansion/contraction/churn buckets', () => {
  const result = buildRevenueWaterfall(EXAMPLE_ACCOUNTS);
  assert.strictEqual(result.newARR, 300);
  assert.strictEqual(result.expansionARR, 200);
  assert.strictEqual(result.contractionARR, 150);
  assert.strictEqual(result.churnedARR, 800);
});

test('endingARR reconciles exactly against the sum of all currentARR values', () => {
  const result = buildRevenueWaterfall(EXAMPLE_ACCOUNTS);
  const sumCurrent = EXAMPLE_ACCOUNTS.reduce((s, a) => s + a.currentARR, 0);
  assert.strictEqual(result.endingARR, sumCurrent);
});

test('hand-verified NRR (includes expansion, excludes new logos)', () => {
  const result = buildRevenueWaterfall(EXAMPLE_ACCOUNTS);
  assert.strictEqual(result.nrr, 0.7222);
});

test('hand-verified GRR (excludes expansion entirely)', () => {
  const result = buildRevenueWaterfall(EXAMPLE_ACCOUNTS);
  assert.strictEqual(result.grr, 0.6481);
});

test('GRR is always <= NRR, since GRR excludes the expansion credit NRR includes', () => {
  const result = buildRevenueWaterfall(EXAMPLE_ACCOUNTS);
  assert.ok(result.grr <= result.nrr);
});

test('GRR can never exceed 1.0 by construction (no expansion credit to inflate it)', () => {
  const allExpansion = [
    { accountId: 'A1', previousARR: 1000, currentARR: 2000 },
    { accountId: 'A2', previousARR: 500, currentARR: 900 },
  ];
  const result = buildRevenueWaterfall(allExpansion);
  assert.ok(result.grr <= 1.0);
  assert.ok(result.nrr > 1.0); // NRR, unlike GRR, legitimately can exceed 100%
});

test('a portfolio with 100% retention and no changes yields NRR = GRR = 1.0', () => {
  const flat = [
    { accountId: 'A1', previousARR: 1000, currentARR: 1000 },
    { accountId: 'A2', previousARR: 500, currentARR: 500 },
  ];
  const result = buildRevenueWaterfall(flat);
  assert.strictEqual(result.nrr, 1);
  assert.strictEqual(result.grr, 1);
});

test('throws when every account is new (no existing revenue base)', () => {
  const allNew = [{ accountId: 'A1', previousARR: 0, currentARR: 500 }];
  assert.throws(() => buildRevenueWaterfall(allNew));
});

test('throws on an empty accounts array', () => {
  assert.throws(() => buildRevenueWaterfall([]));
});

test('throws when an account is missing accountId', () => {
  assert.throws(() => buildRevenueWaterfall([{ previousARR: 100, currentARR: 200 }]));
});

test('byAccount includes a correct classification for every account', () => {
  const result = buildRevenueWaterfall(EXAMPLE_ACCOUNTS);
  const classifications = result.byAccount.map((a) => a.classification);
  assert.deepStrictEqual(classifications, ['expansion', 'flat', 'churned', 'new', 'contraction']);
});

console.log(`\n${passed}/${total} passing`);
