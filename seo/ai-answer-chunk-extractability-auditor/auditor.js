/**
 * AI Answer-Chunk Extractability Auditor
 * MV3 Marketing — SEO / GEO / Content skill
 *
 * Simulates how a RAG engine chunks a page for retrieval and scores each
 * chunk for self-containedness: can this chunk stand alone as an answer
 * without needing the surrounding page for context? Real heuristics, not
 * a schema-presence checklist.
 */

'use strict';

const DANGLING_OPENERS = /^(this|that|these|those|it|he|she|they|such|the former|the latter)\b/i;
const CONTEXT_DEPENDENCY_PHRASES = [
  /as (?:mentioned|discussed|noted|described) (?:above|earlier|previously)/i,
  /in the previous (?:section|paragraph|step)/i,
  /(?:see|refer to) (?:above|below)/i,
  /as (?:we|I) (?:mentioned|discussed|noted) (?:above|earlier)/i,
  /the following (?:section|steps|list) (?:below|will)/i,
];
const MIN_WORDS = 20;
const MAX_WORDS = 200;

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Crude, honest heuristic for "does this chunk define its own subject
 * early on" - looks for a defined-term pattern ("X is a/an/the Y", "X
 * refers to") or a capitalized multi-word phrase (proper-noun-like) in
 * the first sentence. Not real NER - stated as a heuristic in the docs.
 */
function hasClearSubject(firstSentence) {
  if (/\b[A-Z][a-zA-Z]*\s+(?:is|are|refers to|means)\s+(?:a|an|the)\b/.test(firstSentence)) return true;
  const properNounRun = /(?:[A-Z][a-zA-Z]+\s+){1,}[A-Z][a-zA-Z]+/;
  return properNounRun.test(firstSentence);
}

/**
 * @param {string} chunkText
 * @returns {{score: number, band: 'excellent'|'good'|'weak'|'poor', issues: string[]}}
 */
function scoreChunk(chunkText) {
  if (typeof chunkText !== 'string' || chunkText.trim() === '') {
    throw new Error('chunkText must be a non-empty string.');
  }
  const trimmed = chunkText.trim();
  const issues = [];
  let score = 100;

  if (DANGLING_OPENERS.test(trimmed)) {
    score -= 30;
    issues.push('Opens with a dangling reference (pronoun/demonstrative) with no antecedent inside the chunk itself.');
  }

  let contextHits = 0;
  for (const pattern of CONTEXT_DEPENDENCY_PHRASES) {
    if (pattern.test(trimmed)) contextHits++;
  }
  if (contextHits > 0) {
    score -= Math.min(25 * contextHits, 40);
    issues.push(`Contains ${contextHits} explicit context-dependency phrase(s) ("as mentioned above," "see below," etc.) that assume surrounding page context.`);
  }

  const words = wordCount(trimmed);
  if (words < MIN_WORDS) {
    score -= 15;
    issues.push(`Only ${words} words - likely too short to stand alone as a complete answer.`);
  } else if (words > MAX_WORDS) {
    score -= 10;
    issues.push(`${words} words - likely spans multiple retrievable chunks; unclear which sub-claim a RAG engine would actually extract.`);
  }

  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
  if (hasClearSubject(firstSentence)) {
    score = Math.min(100, score + 10);
  } else {
    issues.push('No clearly identifiable subject in the opening sentence - a retrieval engine may surface this chunk without knowing what it is about.');
  }

  score = Math.max(0, Math.min(100, score));
  let band;
  if (score >= 80) band = 'excellent';
  else if (score >= 60) band = 'good';
  else if (score >= 40) band = 'weak';
  else band = 'poor';

  return { score, band, issues };
}

/**
 * @param {string[]} chunks
 * @returns {Array<{index: number, score: number, band: string, issues: string[]}>}
 */
function auditChunks(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) throw new Error('chunks must be a non-empty array.');
  return chunks.map((c, index) => ({ index, ...scoreChunk(c) }));
}

module.exports = { scoreChunk, auditChunks, wordCount, hasClearSubject };
