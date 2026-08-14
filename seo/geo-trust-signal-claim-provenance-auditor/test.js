'use strict';
const assert = require('assert');
const { detectClaims, auditClaimProvenance, auditPersonSchema } = require('./auditor.js');

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

test('throws on non-string input', () => {
  assert.throws(() => detectClaims(123));
});

test('detects a dollar-amount claim', () => {
  const claims = detectClaims('This plan costs $2,997 per month.');
  assert.ok(claims.some((c) => c.type === 'dollar_amount' && c.match === '$2,997'));
});

test('detects a percentage claim', () => {
  const claims = detectClaims('Conversion rates improved by 34% last quarter.');
  assert.ok(claims.some((c) => c.type === 'percentage' && c.match === '34%'));
});

test('detects a bulletin-code-style claim (matches the atvshop R-135 pattern)', () => {
  const claims = detectClaims('Recall bulletin T-23-04 covers this issue.');
  assert.ok(claims.some((c) => c.type === 'bulletin_code' && c.match === 'T-23-04'));
});

test('detects a specific-count claim', () => {
  const claims = detectClaims('Trusted by 1,200 customers across the US.');
  assert.ok(claims.some((c) => c.type === 'specific_count'));
});

test('a claim with a nearby URL is marked sourced', () => {
  const text = 'Revenue grew 45% this year (see https://example.com/report for the full breakdown).';
  const claims = detectClaims(text);
  const pct = claims.find((c) => c.type === 'percentage');
  assert.strictEqual(pct.sourced, true);
});

test('a claim with no nearby URL is marked unsourced', () => {
  const text = 'Revenue grew 45% this year, according to our internal data.';
  const claims = detectClaims(text);
  const pct = claims.find((c) => c.type === 'percentage');
  assert.strictEqual(pct.sourced, false);
});

test('a claim with a URL far outside the proximity window is still marked unsourced', () => {
  const farText = 'Revenue grew 45% this year. ' + 'Padding text to push the source far away. '.repeat(20) + 'https://example.com/report';
  const claims = detectClaims(farText);
  const pct = claims.find((c) => c.type === 'percentage');
  assert.strictEqual(pct.sourced, false);
});

test('auditClaimProvenance correctly tallies total vs unsourced claims', () => {
  // The two claims are deliberately separated by more than the 200-char
  // proximity window, so only the first (near the URL) counts as sourced.
  const text = 'Pricing starts at $997 (see https://example.com/pricing). '
    + 'Padding text to push the second claim well past the two-hundred-character proximity window used for sourcing checks. '.repeat(2)
    + 'Support satisfaction is 98%.';
  const result = auditClaimProvenance(text);
  assert.strictEqual(result.totalClaims, 2);
  assert.strictEqual(result.unsourcedClaims, 1);
});

test('text with no numeric claims returns an empty claims list', () => {
  const result = auditClaimProvenance('This is a plain sentence with no specific numbers in it at all.');
  assert.strictEqual(result.totalClaims, 0);
});

// --- Person schema ---
test('auditPersonSchema throws on non-object input', () => {
  assert.throws(() => auditPersonSchema(null));
});

test('a complete Person schema passes with no issues', () => {
  const result = auditPersonSchema({ name: 'Vance Moore', jobTitle: 'Chief Growth Officer', sameAs: ['https://linkedin.com/in/vancemoore'] });
  assert.strictEqual(result.complete, true);
  assert.deepStrictEqual(result.issues, []);
});

test('a Person schema missing sameAs is flagged incomplete', () => {
  const result = auditPersonSchema({ name: 'Vance Moore', jobTitle: 'Chief Growth Officer', sameAs: [] });
  assert.strictEqual(result.complete, false);
  assert.ok(result.issues.some((i) => i.includes('sameAs')));
});

test('a Person schema with an invalid (non-URL) sameAs entry is flagged', () => {
  const result = auditPersonSchema({ name: 'Vance Moore', jobTitle: 'CGO', sameAs: ['not-a-url'] });
  assert.strictEqual(result.complete, false);
});

test('a Person schema missing name and jobTitle is flagged with both issues', () => {
  const result = auditPersonSchema({ sameAs: ['https://linkedin.com/in/x'] });
  assert.strictEqual(result.issues.length, 2);
});

console.log(`\n${passed}/15 passing`);
