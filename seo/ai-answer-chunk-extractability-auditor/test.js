'use strict';
const assert = require('assert');
const { scoreChunk, auditChunks, wordCount, hasClearSubject } = require('./auditor.js');

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

test('throws on empty chunk text', () => {
  assert.throws(() => scoreChunk(''));
});

test('wordCount counts correctly', () => {
  assert.strictEqual(wordCount('one two three'), 3);
});

test('hasClearSubject detects a defined-term pattern', () => {
  assert.strictEqual(hasClearSubject('GEO Citability Score is a structured rubric for scoring pages.'), true);
});

test('hasClearSubject detects a proper-noun-like phrase', () => {
  assert.strictEqual(hasClearSubject('Google Search Console flags coverage issues.'), true);
});

test('hasClearSubject returns false for a subject-less opener', () => {
  assert.strictEqual(hasClearSubject('it depends on several factors that vary.'), false);
});

test('a chunk opening with a dangling pronoun is penalized and flagged', () => {
  const result = scoreChunk('This means the process is much faster than before, according to internal tests. It also saves significant time and money for most customers using the tool.');
  assert.ok(result.issues.some((i) => i.includes('dangling reference')));
  assert.ok(result.score < 100);
});

test('a chunk with an explicit context-dependency phrase is penalized and flagged', () => {
  const result = scoreChunk('As mentioned above, GEO Citability Score is a structured rubric that scores five real factors for AI answer engines to evaluate content trustworthiness and relevance.');
  assert.ok(result.issues.some((i) => i.includes('context-dependency')));
});

test('a very short chunk is flagged for insufficient length', () => {
  const result = scoreChunk('GEO Citability Score is a rubric.');
  assert.ok(result.issues.some((i) => i.includes('too short')));
});

test('a very long chunk is flagged for likely spanning multiple retrievable units', () => {
  const longText = 'GEO Citability Score is a structured rubric. ' + 'Additional detail sentence describing more context and nuance. '.repeat(25); // 7 + 9*25 = 232 words, safely over the 200-word threshold
  const result = scoreChunk(longText);
  assert.ok(result.issues.some((i) => i.includes('spans multiple')));
});

test('a clean, self-contained, well-scoped chunk scores in the excellent band', () => {
  const chunk = 'GEO Citability Score is a structured rubric that scores AI-answer readiness across five factors: schema presence, answer-directness, entity clarity, freshness honesty, and chunk-extractability. Each factor is scored 0 to 20, and the five scores sum to a single 0-100 index a team can track over time. Sites publishing content with a Citability Score above 70 are cited more frequently in AI Overviews and Perplexity answers, based on MV3 client observations across a 6-month sample.';
  const result = scoreChunk(chunk);
  assert.strictEqual(result.band, 'excellent');
});

test('a chunk with multiple real problems scores in the poor band', () => {
  const result = scoreChunk('This is it. As mentioned above.');
  assert.strictEqual(result.band, 'poor');
});

test('score is always clamped between 0 and 100', () => {
  const result = scoreChunk('This. As mentioned above. As discussed earlier. See below.');
  assert.ok(result.score >= 0 && result.score <= 100);
});

test('auditChunks throws on an empty array', () => {
  assert.throws(() => auditChunks([]));
});

test('auditChunks returns one scored result per input chunk, preserving index order', () => {
  const chunks = [
    'GEO Citability Score is a structured rubric for content quality assessment across AI search engines and traditional search results simultaneously.',
    'This is a vague, context-dependent chunk.',
  ];
  const results = auditChunks(chunks);
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].index, 0);
  assert.strictEqual(results[1].index, 1);
  assert.ok(results[0].score > results[1].score);
});

console.log(`\n${passed}/14 passing`);
