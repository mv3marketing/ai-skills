'use strict';
const assert = require('assert');
const { evaluateSend, RAMP_STAGES, MAX_SAFE_BOUNCE_RATE, MAX_SAFE_COMPLAINT_RATE } = require('./gate.js');

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

const goodDomain = (overrides = {}) => Object.assign({
  ageDays: 45,
  spf: true,
  dkim: true,
  dmarc: true,
  recentDays: [
    { date: '2026-08-10', sent: 100, bounced: 1, complaints: 0 },
    { date: '2026-08-11', sent: 120, bounced: 1, complaints: 0 },
    { date: '2026-08-12', sent: 0, bounced: 0, complaints: 0 },
  ],
}, overrides);

test('throws on invalid plannedVolume', () => {
  assert.throws(() => evaluateSend(goodDomain(), -5));
});

test('throws on invalid domain.ageDays', () => {
  assert.throws(() => evaluateSend(goodDomain({ ageDays: -1 }), 10));
});

test('blocks a domain missing SPF/DKIM/DMARC entirely', () => {
  const result = evaluateSend(goodDomain({ spf: false, dkim: false, dmarc: false }), 10);
  assert.strictEqual(result.allow, false);
  assert.match(result.reason, /SPF, DKIM, DMARC/);
  assert.strictEqual(result.dailyCap, 0);
});

test('blocks a domain missing only DMARC', () => {
  const result = evaluateSend(goodDomain({ dmarc: false }), 10);
  assert.strictEqual(result.allow, false);
  assert.match(result.reason, /DMARC/);
  assert.doesNotMatch(result.reason, /SPF/);
});

test('a brand-new domain (3 days old) gets the tightest ramp cap', () => {
  const result = evaluateSend(goodDomain({ ageDays: 3, recentDays: [] }), 40);
  assert.strictEqual(result.allow, true);
  assert.strictEqual(result.currentStage.dailyCap, 50);
});

test('a brand-new domain is blocked from exceeding its tight cap', () => {
  const result = evaluateSend(goodDomain({ ageDays: 3, recentDays: [] }), 200);
  assert.strictEqual(result.allow, false);
  assert.strictEqual(result.dailyCap, 50);
});

test('a mature domain (200 days old) gets the top ramp stage', () => {
  const result = evaluateSend(goodDomain({ ageDays: 200, recentDays: [] }), 3000);
  assert.strictEqual(result.allow, true);
  assert.strictEqual(result.currentStage.dailyCap, 5000);
});

test('blocks when recent complaint rate exceeds the safe ceiling', () => {
  const domain = goodDomain({
    recentDays: [{ date: '2026-08-12', sent: 1000, bounced: 2, complaints: 5 }], // 0.5% complaint rate > 0.3%
  });
  const result = evaluateSend(domain, 10);
  assert.strictEqual(result.allow, false);
  assert.match(result.reason, /complaint rate/);
});

test('blocks when recent bounce rate exceeds the safe ceiling', () => {
  const domain = goodDomain({
    recentDays: [{ date: '2026-08-12', sent: 1000, bounced: 30, complaints: 0 }], // 3% bounce > 2%
  });
  const result = evaluateSend(domain, 10);
  assert.strictEqual(result.allow, false);
  assert.match(result.reason, /bounce rate/);
});

test('halves the cap and warns when bounce rate is elevated but under the hard ceiling', () => {
  const domain = goodDomain({
    ageDays: 200,
    recentDays: [{ date: '2026-08-12', sent: 1000, bounced: 15, complaints: 0 }], // 1.5% > half of 2% ceiling
  });
  const result = evaluateSend(domain, 100);
  assert.strictEqual(result.dailyCap, 2500); // half of 5000
  assert.ok(result.warnings.length > 0);
});

test('accounts for volume already sent today against the same cap', () => {
  const domain = goodDomain({
    ageDays: 200,
    recentDays: [{ date: '2026-08-12', sent: 4900, bounced: 5, complaints: 0 }],
  });
  const result = evaluateSend(domain, 200);
  assert.strictEqual(result.allow, false);
  assert.match(result.reason, /remaining safe capacity 100/);
});

test('allows exactly the remaining capacity, not one more', () => {
  const domain = goodDomain({
    ageDays: 200,
    recentDays: [{ date: '2026-08-12', sent: 4900, bounced: 5, complaints: 0 }],
  });
  const exact = evaluateSend(domain, 100);
  assert.strictEqual(exact.allow, true);
  const overBy1 = evaluateSend(domain, 101);
  assert.strictEqual(overBy1.allow, false);
});

test('a fully clean, small planned volume on a healthy domain is allowed', () => {
  const result = evaluateSend(goodDomain(), 50);
  assert.strictEqual(result.allow, true);
  assert.strictEqual(result.warnings.length, 0);
});

test('RAMP_STAGES is exported and ordered ascending by dailyCap', () => {
  for (let i = 1; i < RAMP_STAGES.length; i++) {
    assert.ok(RAMP_STAGES[i].dailyCap >= RAMP_STAGES[i - 1].dailyCap);
  }
});

test('thresholds are exported and sane', () => {
  assert.ok(MAX_SAFE_BOUNCE_RATE > 0 && MAX_SAFE_BOUNCE_RATE < 1);
  assert.ok(MAX_SAFE_COMPLAINT_RATE > 0 && MAX_SAFE_COMPLAINT_RATE < MAX_SAFE_BOUNCE_RATE);
});

console.log(`\n${passed}/15 passing`);
