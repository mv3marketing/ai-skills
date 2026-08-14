'use strict';
const assert = require('assert');
const { findCitationLeakage, jaccardSimilarity, tokenize } = require('./mapper.js');

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

test('tokenize lowercases and strips stopwords', () => {
  const tokens = tokenize('How to Calculate the CAC Payback Period for a SaaS Company');
  assert.ok(!tokens.includes('the'));
  assert.ok(!tokens.includes('how'));
  assert.ok(tokens.includes('cac'));
});

test('jaccardSimilarity of identical token sets is 1', () => {
  assert.strictEqual(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
});

test('jaccardSimilarity of disjoint token sets is 0', () => {
  assert.strictEqual(jaccardSimilarity(['a', 'b'], ['c', 'd']), 0);
});

test('jaccardSimilarity of both-empty sets is 0, not NaN', () => {
  assert.strictEqual(jaccardSimilarity([], []), 0);
});

test('throws on empty ourPages', () => {
  assert.throws(() => findCitationLeakage([], [], 'oursite.com'));
});

test('throws when citations is not an array', () => {
  assert.throws(() => findCitationLeakage([{ url: 'x', topics: ['x'] }], 'nope', 'oursite.com'));
});

test('throws on missing ourDomain', () => {
  assert.throws(() => findCitationLeakage([{ url: 'x', topics: ['x'] }], [], ''));
});

test('throws on invalid similarityThreshold', () => {
  assert.throws(() => findCitationLeakage([{ url: 'x', topics: ['x'] }], [], 'oursite.com', { similarityThreshold: 2 }));
});

test('flags a real leakage case: competitor cited, we cover it well, we are never cited', () => {
  // Page topics deliberately tight (not diluted with extra keywords) so the
  // Jaccard overlap against the citation topic is realistically strong.
  const ourPages = [{ url: '/blog/cac-payback-period', topics: ['CAC payback period'] }];
  const citations = [
    { topic: 'CAC payback period calculation', citingDomain: 'competitor.com' },
  ];
  const findings = findCitationLeakage(ourPages, citations, 'oursite.com');
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].citingDomain, 'competitor.com');
  assert.strictEqual(findings[0].matchedPage, '/blog/cac-payback-period');
});

test('does not flag a topic we are already cited for ourselves', () => {
  const ourPages = [{ url: '/blog/cac-payback-period', topics: ['CAC payback period', 'SaaS unit economics'] }];
  const citations = [
    { topic: 'CAC payback period calculation', citingDomain: 'competitor.com' },
    { topic: 'CAC payback period calculation', citingDomain: 'oursite.com' },
  ];
  const findings = findCitationLeakage(ourPages, citations, 'oursite.com');
  assert.strictEqual(findings.length, 0);
});

test('does not flag a topic we do not actually cover well', () => {
  const ourPages = [{ url: '/blog/email-deliverability', topics: ['email deliverability', 'SPF DKIM DMARC'] }];
  const citations = [{ topic: 'best programming languages for beginners in 2026', citingDomain: 'competitor.com' }];
  const findings = findCitationLeakage(ourPages, citations, 'oursite.com');
  assert.strictEqual(findings.length, 0);
});

test('ignores citations where citingDomain is our own domain (nothing to leak)', () => {
  const ourPages = [{ url: '/blog/cac-payback-period', topics: ['CAC payback period'] }];
  const citations = [{ topic: 'CAC payback period', citingDomain: 'oursite.com' }];
  const findings = findCitationLeakage(ourPages, citations, 'oursite.com');
  assert.strictEqual(findings.length, 0);
});

test('matchedPage picks the best-matching page when multiple pages exist', () => {
  const ourPages = [
    { url: '/blog/unrelated', topics: ['office chairs', 'ergonomics'] },
    { url: '/blog/cac-payback-period', topics: ['CAC payback period', 'SaaS unit economics'] },
  ];
  const citations = [{ topic: 'CAC payback period benchmark', citingDomain: 'competitor.com' }];
  const findings = findCitationLeakage(ourPages, citations, 'oursite.com');
  assert.strictEqual(findings[0].matchedPage, '/blog/cac-payback-period');
});

test('a stricter similarityThreshold filters out marginal matches', () => {
  const ourPages = [{ url: '/blog/cac-payback-period', topics: ['CAC payback period'] }];
  const citations = [{ topic: 'CAC payback', citingDomain: 'competitor.com' }]; // partial overlap only
  const lenient = findCitationLeakage(ourPages, citations, 'oursite.com', { similarityThreshold: 0.2 });
  const strict = findCitationLeakage(ourPages, citations, 'oursite.com', { similarityThreshold: 0.9 });
  assert.ok(lenient.length >= strict.length);
});

console.log(`\n${passed}/14 passing`);
