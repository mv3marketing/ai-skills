'use strict';
const assert = require('assert');
const { parseSpf, parseDkim, parseDmarc, trendSlope, diagnose } = require('./diagnostic.js');

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

// --- SPF ---
test('parseSpf: missing record is flagged not present', () => {
  const r = parseSpf('');
  assert.strictEqual(r.present, false);
  assert.strictEqual(r.valid, false);
});

test('parseSpf: record not starting with v=spf1 is invalid', () => {
  const r = parseSpf('v=spf2 -all');
  assert.strictEqual(r.valid, false);
});

test('parseSpf: a clean record with -all and includes under the limit is valid', () => {
  const r = parseSpf('v=spf1 include:_spf.google.com include:sendgrid.net -all');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.lookupCount, 2);
});

test('parseSpf: +all is flagged as a real risk', () => {
  const r = parseSpf('v=spf1 include:_spf.google.com +all');
  assert.strictEqual(r.valid, false);
  assert.ok(r.issues.some((i) => i.includes('+all')));
});

test('parseSpf: missing terminal all is flagged', () => {
  const r = parseSpf('v=spf1 include:_spf.google.com');
  assert.strictEqual(r.valid, false);
  assert.ok(r.issues.some((i) => i.includes('No terminal')));
});

test('parseSpf: exceeding the real 10-lookup RFC limit is flagged', () => {
  const includes = Array.from({ length: 11 }, (_, i) => `include:domain${i}.com`).join(' ');
  const r = parseSpf(`v=spf1 ${includes} -all`);
  assert.strictEqual(r.lookupCount, 11);
  assert.ok(r.issues.some((i) => i.includes('10-lookup limit')));
});

// --- DKIM ---
test('parseDkim: missing record is flagged not present', () => {
  const r = parseDkim('');
  assert.strictEqual(r.present, false);
});

test('parseDkim: a clean record is valid', () => {
  const r = parseDkim('v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC');
  assert.strictEqual(r.valid, true);
});

test('parseDkim: an empty p= tag (revoked key) is flagged', () => {
  const r = parseDkim('v=DKIM1; k=rsa; p=');
  assert.strictEqual(r.valid, false);
  assert.ok(r.issues.some((i) => i.includes('revoked')));
});

test('parseDkim: an unrecognized algorithm is flagged', () => {
  const r = parseDkim('v=DKIM1; k=dsa; p=abc123');
  assert.strictEqual(r.valid, false);
});

// --- DMARC ---
test('parseDmarc: missing record is flagged not present', () => {
  const r = parseDmarc('');
  assert.strictEqual(r.present, false);
});

test('parseDmarc: p=reject is fully valid with no issues', () => {
  const r = parseDmarc('v=DMARC1; p=reject; rua=mailto:dmarc@example.com; pct=100');
  assert.strictEqual(r.valid, true);
});

test('parseDmarc: p=none is technically present but flagged as weak', () => {
  const r = parseDmarc('v=DMARC1; p=none;');
  assert.strictEqual(r.valid, false);
  assert.ok(r.issues.some((i) => i.includes('monitoring only')));
});

test('parseDmarc: an out-of-range pct is flagged', () => {
  const r = parseDmarc('v=DMARC1; p=reject; pct=150');
  assert.strictEqual(r.valid, false);
});

// --- trendSlope ---
test('trendSlope: throws with fewer than 2 points', () => {
  assert.throws(() => trendSlope([{ day: 0, rate: 0.01 }]));
});

test('trendSlope: detects a clearly worsening (positive) trend', () => {
  const history = [{ day: 0, rate: 0.01 }, { day: 1, rate: 0.02 }, { day: 2, rate: 0.03 }, { day: 3, rate: 0.04 }];
  const slope = trendSlope(history);
  assert.ok(slope > 0);
});

test('trendSlope: detects a clearly improving (negative) trend', () => {
  const history = [{ day: 0, rate: 0.05 }, { day: 1, rate: 0.03 }, { day: 2, rate: 0.02 }, { day: 3, rate: 0.01 }];
  const slope = trendSlope(history);
  assert.ok(slope < 0);
});

test('trendSlope: a flat history has a near-zero slope', () => {
  const history = [{ day: 0, rate: 0.01 }, { day: 1, rate: 0.01 }, { day: 2, rate: 0.01 }];
  const slope = trendSlope(history);
  assert.ok(Math.abs(slope) < 0.0001);
});

// --- diagnose (integration) ---
test('diagnose: a fully clean domain with healthy rates is marked healthy', () => {
  const result = diagnose({
    spfRecord: 'v=spf1 include:_spf.google.com -all',
    dkimRecord: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC',
    dmarcRecord: 'v=DMARC1; p=reject;',
    bounceHistory: [{ day: 0, rate: 0.005 }, { day: 1, rate: 0.004 }],
    complaintHistory: [{ day: 0, rate: 0.0005 }, { day: 1, rate: 0.0004 }],
  });
  assert.strictEqual(result.healthy, true);
});

test('diagnose: missing DMARC makes the domain unhealthy even with clean rates', () => {
  const result = diagnose({
    spfRecord: 'v=spf1 include:_spf.google.com -all',
    dkimRecord: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC',
    dmarcRecord: '',
    bounceHistory: [{ day: 0, rate: 0.005 }],
    complaintHistory: [{ day: 0, rate: 0.0005 }],
  });
  assert.strictEqual(result.healthy, false);
});

test('diagnose: high bounce rate makes an otherwise-clean domain unhealthy', () => {
  const result = diagnose({
    spfRecord: 'v=spf1 include:_spf.google.com -all',
    dkimRecord: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC',
    dmarcRecord: 'v=DMARC1; p=reject;',
    bounceHistory: [{ day: 0, rate: 0.08 }],
    complaintHistory: [{ day: 0, rate: 0.0005 }],
  });
  assert.strictEqual(result.healthy, false);
});

console.log(`\n${passed}/21 passing`);
