'use strict';
const assert = require('assert');
const { auditPipeline, levenshtein, similarity } = require('./auditor.js');

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

const config = {
  stageOrder: ['Prospecting', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'],
  stageVelocityMedianDays: { Prospecting: 7, Qualified: 10, Proposal: 14, Negotiation: 10, 'Closed Won': 0 },
  requiredFields: ['amount', 'closeDate'],
};

test('levenshtein of identical strings is 0', () => {
  assert.strictEqual(levenshtein('Acme Corp', 'Acme Corp'), 0);
});

test('levenshtein is case-insensitive', () => {
  assert.strictEqual(levenshtein('ACME', 'acme'), 0);
});

test('similarity of identical strings is 1', () => {
  assert.strictEqual(similarity('Acme Corp', 'Acme Corp'), 1);
});

test('throws when deals is not an array', () => {
  assert.throws(() => auditPipeline('nope', config));
});

test('throws on missing stageOrder', () => {
  assert.throws(() => auditPipeline([], {}));
});

test('throws when a deal has an unrecognized stage', () => {
  const deals = [{ id: 1, name: 'X', stage: 'Not A Real Stage' }];
  assert.throws(() => auditPipeline(deals, config), /unknown stage/);
});

test('throws when a deal has no id', () => {
  const deals = [{ name: 'X', stage: 'Qualified' }];
  assert.throws(() => auditPipeline(deals, config), /must have an id/);
});

test('flags a deal stale when daysInStage exceeds median * multiplier', () => {
  const deals = [{ id: 1, name: 'Acme deal', company: 'Acme', stage: 'Qualified', daysInStage: 25, requiredFields: { amount: 5000, closeDate: '2026-09-01' } }];
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.staleDeals.length, 1);
  assert.strictEqual(result.staleDeals[0].threshold, 20); // 10 * 2
});

test('does not flag a deal under its stage threshold', () => {
  const deals = [{ id: 1, name: 'Acme deal', company: 'Acme', stage: 'Qualified', daysInStage: 12, requiredFields: { amount: 5000, closeDate: '2026-09-01' } }];
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.staleDeals.length, 0);
});

test('flags missing required fields', () => {
  const deals = [{ id: 1, name: 'Acme deal', company: 'Acme', stage: 'Prospecting', daysInStage: 1, requiredFields: { amount: null, closeDate: '2026-09-01' } }];
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.missingFieldDeals.length, 1);
  assert.deepStrictEqual(result.missingFieldDeals[0].missingFields, ['amount']);
});

test('detects a stage-skip anomaly (jumped more than one stage)', () => {
  const deals = [{ id: 1, name: 'Acme deal', company: 'Acme', stage: 'Negotiation', daysInStage: 1, requiredFields: { amount: 1, closeDate: '2026-09-01' }, stageHistory: [0, 3] }]; // Prospecting -> Negotiation, skips Qualified+Proposal
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.stageSkipDeals.length, 1);
  assert.strictEqual(result.stageSkipDeals[0].stagesSkipped, 2);
});

test('does not flag normal sequential stage progression', () => {
  const deals = [{ id: 1, name: 'Acme deal', company: 'Acme', stage: 'Proposal', daysInStage: 1, requiredFields: { amount: 1, closeDate: '2026-09-01' }, stageHistory: [0, 1, 2] }];
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.stageSkipDeals.length, 0);
});

test('flags near-identical deal name+company pairs as possible dupes', () => {
  const deals = [
    { id: 1, name: 'Acme Corp - Enterprise Deal', company: 'Acme Corporation', stage: 'Prospecting', daysInStage: 1, requiredFields: { amount: 1, closeDate: 'x' } },
    { id: 2, name: 'Acme Corp - Enterprise Deal', company: 'Acme Corporation', stage: 'Prospecting', daysInStage: 1, requiredFields: { amount: 1, closeDate: 'x' } },
  ];
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.possibleDupes.length, 1);
});

test('does not flag genuinely different deals as dupes', () => {
  const deals = [
    { id: 1, name: 'Acme Corp Deal', company: 'Acme', stage: 'Prospecting', daysInStage: 1, requiredFields: { amount: 1, closeDate: 'x' } },
    { id: 2, name: 'Totally Different Widgets Inc', company: 'Widgets Inc', stage: 'Prospecting', daysInStage: 1, requiredFields: { amount: 1, closeDate: 'x' } },
  ];
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.possibleDupes.length, 0);
});

test('prioritized list sorts stage-skips and dupes above stale and missing-field issues', () => {
  const deals = [
    { id: 1, name: 'A', company: 'A Co', stage: 'Prospecting', daysInStage: 1, requiredFields: { amount: null, closeDate: 'x' } }, // missing field
    { id: 2, name: 'B', company: 'B Co', stage: 'Negotiation', daysInStage: 1, requiredFields: { amount: 1, closeDate: 'x' }, stageHistory: [0, 3] }, // stage skip
  ];
  const result = auditPipeline(deals, config);
  assert.strictEqual(result.prioritized[0].issue, 'stage_skip');
  assert.strictEqual(result.prioritized[result.prioritized.length - 1].issue, 'missing_fields');
});

console.log(`\n${passed}/15 passing`);
