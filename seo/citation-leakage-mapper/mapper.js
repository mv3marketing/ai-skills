/**
 * Citation-Leakage Mapper
 * MV3 Marketing — SEO / GEO / Content skill
 *
 * Finds topics where a competitor domain is visibly cited by an AI answer
 * engine, while YOUR OWN site has strong topical coverage for that exact
 * topic yet never appears in the citation list for it - a real,
 * measurable "we're feeding the topic, they get the credit" gap.
 */

'use strict';

const STOPWORDS = new Set(['the', 'a', 'an', 'for', 'of', 'to', 'and', 'in', 'on', 'with', 'how', 'what', 'is', 'are']);

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/**
 * Jaccard similarity between two token sets: |intersection| / |union|.
 */
function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * @param {Array<{url: string, topics: string[]}>} ourPages
 * @param {Array<{topic: string, citingDomain: string}>} citations
 * @param {string} ourDomain
 * @param {Object} [opts]
 * @param {number} [opts.similarityThreshold=0.4]
 * @returns {Array<{topic: string, citingDomain: string, matchedPage: string, similarity: number}>}
 */
function findCitationLeakage(ourPages, citations, ourDomain, opts = {}) {
  if (!Array.isArray(ourPages) || ourPages.length === 0) throw new Error('ourPages must be a non-empty array.');
  if (!Array.isArray(citations)) throw new Error('citations must be an array.');
  if (!ourDomain) throw new Error('ourDomain is required.');

  const { similarityThreshold = 0.4 } = opts;
  if (similarityThreshold <= 0 || similarityThreshold > 1) throw new Error('similarityThreshold must be between 0 (exclusive) and 1.');

  const pageTokens = ourPages.map((p) => ({ url: p.url, tokens: tokenize(p.topics.join(' ')) }));

  const findings = [];
  for (const citation of citations) {
    if (citation.citingDomain === ourDomain) continue; // we already got the credit here

    const citationTokens = tokenize(citation.topic);
    let best = { url: null, similarity: 0 };
    for (const page of pageTokens) {
      const sim = jaccardSimilarity(citationTokens, page.tokens);
      if (sim > best.similarity) best = { url: page.url, similarity: sim };
    }

    if (best.similarity < similarityThreshold) continue; // we don't actually cover this topic well

    // Do we already have a citation of our own for a sufficiently similar topic?
    const weAreCitedForThis = citations.some((c) => {
      if (c.citingDomain !== ourDomain) return false;
      return jaccardSimilarity(tokenize(c.topic), citationTokens) >= similarityThreshold;
    });
    if (weAreCitedForThis) continue;

    findings.push({
      topic: citation.topic,
      citingDomain: citation.citingDomain,
      matchedPage: best.url,
      similarity: Number(best.similarity.toFixed(3)),
    });
  }

  return findings;
}

module.exports = { findCitationLeakage, jaccardSimilarity, tokenize };
