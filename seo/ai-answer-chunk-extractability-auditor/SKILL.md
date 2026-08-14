---
name: ai-answer-chunk-extractability-auditor
description: Simulates how a RAG engine chunks a page for retrieval and scores each chunk for self-containedness - dangling references, context-dependency phrases, length, and subject clarity - real heuristics, not a schema-presence checklist. Use when auditing existing content for AI-answer-engine readiness.
---

# AI Answer-Chunk Extractability Auditor

Every existing "AI crawler checker" reads robots.txt rules. This skill instead simulates the
actual retrieval problem: if an AI answer engine pulled just THIS chunk out of your page with
no surrounding context, would it make sense on its own?

## What this is (and isn't)

A text-heuristic scoring function over chunks you supply, not a real RAG/embedding system or
a hosted service. The subject-clarity check is an honest heuristic (proper-noun-pattern and
defined-term detection), not real named-entity recognition — stated directly in the docs.

## Files

| File | Purpose |
|---|---|
| `auditor.js` | `scoreChunk()`, `auditChunks()`, plus exported `wordCount()`/`hasClearSubject()` — zero dependencies |
| `test.js` | 14-test suite covering each real heuristic and band thresholds |

## How to use it

```js
const { auditChunks } = require('./auditor.js');

const results = auditChunks([
  'GEO Citability Score is a structured rubric that scores AI-answer readiness across five factors...',
  'This means the process is much faster, as mentioned above.',
]);
// [{ index, score, band, issues }, ...]
```

## Real checks, precisely

1. **Dangling references** — opens with "This/That/It/They/Such" etc. with no antecedent
   inside the chunk itself.
2. **Context-dependency phrases** — "as mentioned above," "see below," "in the previous
   section" — explicit tells that the chunk assumes surrounding page context.
3. **Length** — under 20 words (too thin to stand alone) or over 200 words (likely spans
   multiple retrievable units).
4. **Subject clarity** — does the opening sentence identify what it's actually about.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help scoring
your real published content at scale.
