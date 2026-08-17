---
name: duplicate-record-merge-resolver
description: Detects likely-duplicate CRM records using a weighted Jaro-Winkler composite score across company name, domain, and phone, then computes an explainable field-by-field merge plan (non-null beats null, most-recently-updated wins on real conflicts) instead of a blind "keep record A" merge. Use when deduplicating CRM accounts or contacts.
---

# Duplicate Record Merge Resolver

A detection and merge-planning engine, not a live CRM integration. You supply candidate
record pairs; this scores duplicate likelihood and produces a field-by-field merge plan
a human can review before executing.

## What this is (and isn't)

Pure functions over the record data you supply. Not a hosted dedupe service and not a
direct connection to any specific CRM's merge API.

## Files

| File | Purpose |
|---|---|
| `resolver.js` | `jaroWinklerSimilarity()`, `scoreDuplicateLikelihood()`, `computeMergePlan()` — zero dependencies |
| `test.js` | 20-test suite, including the similarity function verified against published Jaro-Winkler reference values (MARTHA/MARHTA, DIXON/DICKSONX) |

## How to use it

```js
const { scoreDuplicateLikelihood, computeMergePlan } = require('./resolver.js');

const scoreResult = scoreDuplicateLikelihood(
  { companyName: 'Acme Inc', domain: 'acme.com', phone: '5551234567' },
  { companyName: 'Acme, Incorporated', domain: 'acme.com', phone: '5551234567' }
);
// scoreResult.isLikelyDuplicate -> true (composite score >= 0.85)

if (scoreResult.isLikelyDuplicate) {
  const plan = computeMergePlan(recordA, recordB, recordA.updatedAt, recordB.updatedAt);
  // plan.survivingFields -> the merged record
  // plan.conflicts -> every field where the two records genuinely disagreed, and why one won
}
```

## The two real guardrails

1. **Weighted composite score across multiple fields, not one strong signal** — company
   name typos, domain differences, and phone formatting are each individually noisy.
   `scoreDuplicateLikelihood()` combines Jaro-Winkler similarity (tuned for short
   strings, verified against published reference values) across all three with
   configurable weights, re-normalized when a field is missing on either side rather
   than unfairly penalizing an incomplete record.
2. **Explainable, non-null-first, most-recent-wins merge** — `computeMergePlan()` never
   blindly prefers one record. A field present on only one side survives automatically;
   when both sides have real, different values, the more recently updated record's value
   wins and the discarded value is recorded in `conflicts`, not silently dropped, so a
   human can review every real decision before the merge executes.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real CRM's actual record and merge APIs.
