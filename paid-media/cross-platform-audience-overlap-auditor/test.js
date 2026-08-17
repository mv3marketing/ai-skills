'use strict';
const assert = require('assert');
const { findAudienceOverlaps, jaccardSimilarity } = require('./auditor.js');

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

test('jaccardSimilarity of identical sets is 1', () => {
  assert.strictEqual(jaccardSimilarity(['a', 'b'], ['a', 'b']), 1);
});

test('jaccardSimilarity of both-empty sets is 0', () => {
  assert.strictEqual(jaccardSimilarity([], []), 0);
});

test('throws with fewer than 2 campaigns', () => {
  assert.throws(() => findAudienceOverlaps([{ campaignId: 'a', audienceSignals: [] }]));
});

test('throws when a campaign is missing audienceSignals', () => {
  assert.throws(() => findAudienceOverlaps([{ campaignId: 'a' }, { campaignId: 'b', audienceSignals: [] }]));
});

test('throws on invalid similarityThreshold', () => {
  const campaigns = [{ campaignId: 'a', audienceSignals: ['x'] }, { campaignId: 'b', audienceSignals: ['x'] }];
  assert.throws(() => findAudienceOverlaps(campaigns, { similarityThreshold: 2 }));
});

test('flags two campaigns with high audience-signal overlap (PMax vs Search self-competition)', () => {
  const campaigns = [
    { campaignId: 'pmax-1', platform: 'google', channel: 'PMax', audienceSignals: ['remarketing-list-A', 'in-market-saas', 'customer-list-1'] },
    { campaignId: 'search-1', platform: 'google', channel: 'Search', audienceSignals: ['remarketing-list-A', 'in-market-saas', 'customer-list-1'] },
  ];
  const findings = findAudienceOverlaps(campaigns);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].similarity, 1);
});

test('does not flag campaigns with no real audience overlap', () => {
  const campaigns = [
    { campaignId: 'a', platform: 'google', channel: 'Search', audienceSignals: ['keyword-set-1'] },
    { campaignId: 'b', platform: 'meta', channel: 'Feed', audienceSignals: ['lookalike-3pct'] },
  ];
  assert.strictEqual(findAudienceOverlaps(campaigns).length, 0);
});

test('does not flag a high-overlap pair that has a deliberate exclusion configured', () => {
  const campaigns = [
    { campaignId: 'pmax-1', platform: 'google', channel: 'PMax', audienceSignals: ['remarketing-list-A'], excludesCampaignIds: ['search-1'] },
    { campaignId: 'search-1', platform: 'google', channel: 'Search', audienceSignals: ['remarketing-list-A'] },
  ];
  assert.strictEqual(findAudienceOverlaps(campaigns).length, 0);
});

test('exclusion works in either direction (B excluding A also counts)', () => {
  const campaigns = [
    { campaignId: 'pmax-1', platform: 'google', channel: 'PMax', audienceSignals: ['remarketing-list-A'] },
    { campaignId: 'search-1', platform: 'google', channel: 'Search', audienceSignals: ['remarketing-list-A'], excludesCampaignIds: ['pmax-1'] },
  ];
  assert.strictEqual(findAudienceOverlaps(campaigns).length, 0);
});

test('flags real cross-platform overlap when the same customer list is uploaded to two platforms', () => {
  const campaigns = [
    { campaignId: 'google-remarketing', platform: 'google', channel: 'Display', audienceSignals: ['customer-list-2026-q3'] },
    { campaignId: 'meta-retargeting', platform: 'meta', channel: 'Feed', audienceSignals: ['customer-list-2026-q3'] },
  ];
  const findings = findAudienceOverlaps(campaigns);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].platformA, 'google');
  assert.strictEqual(findings[0].platformB, 'meta');
});

test('a stricter threshold filters out marginal overlaps', () => {
  const campaigns = [
    { campaignId: 'a', platform: 'google', channel: 'Search', audienceSignals: ['x', 'y', 'z', 'w'] },
    { campaignId: 'b', platform: 'google', channel: 'PMax', audienceSignals: ['x'] },
  ];
  const lenient = findAudienceOverlaps(campaigns, { similarityThreshold: 0.2 });
  const strict = findAudienceOverlaps(campaigns, { similarityThreshold: 0.9 });
  assert.ok(lenient.length >= strict.length);
});

test('findings are sorted descending by similarity', () => {
  const campaigns = [
    { campaignId: 'a', platform: 'google', channel: 'Search', audienceSignals: ['x', 'y'] },
    { campaignId: 'b', platform: 'google', channel: 'PMax', audienceSignals: ['x', 'y', 'z'] },
    { campaignId: 'c', platform: 'google', channel: 'Display', audienceSignals: ['x'] },
  ];
  const findings = findAudienceOverlaps(campaigns, { similarityThreshold: 0.1 });
  for (let i = 1; i < findings.length; i++) {
    assert.ok(findings[i - 1].similarity >= findings[i].similarity);
  }
});

console.log(`\n${passed}/12 passing`);
