---
name: geo-trust-signal-claim-provenance-auditor
description: Real regex-based detection of numerically-specific claims (dollar amounts, percentages, bulletin/model codes) lacking inline sourcing, plus Person schema completeness checks. Generalizes MV3's own internal atvshop R-135 claim-guard pattern into a portable, reusable skill. Use before publishing any content with specific numeric claims.
---

# GEO Trust-Signal / Claim Provenance Auditor

Generalizes a real pattern MV3 already runs internally (the atvshop project's R-135
claim-guard, which strips unsourced recall-bulletin-style claims from render) into a portable
skill for any content, plus a Person-schema completeness check for author trust signals.

## What this is (and isn't)

A text and schema scanner over content you supply, not a hosted service or a live fact-checker
— it flags claims that lack a nearby source, it does not verify whether a sourced claim is
actually true.

## Files

| File | Purpose |
|---|---|
| `auditor.js` | `detectClaims()`, `auditClaimProvenance()`, `auditPersonSchema()` — zero dependencies |
| `test.js` | 15-test suite covering all four claim-pattern types and Person schema completeness |

## How to use it

```js
const { auditClaimProvenance, auditPersonSchema } = require('./auditor.js');

const contentAudit = auditClaimProvenance(pageText);
// contentAudit.totalClaims, contentAudit.unsourcedClaims, contentAudit.claims

const personAudit = auditPersonSchema({ name: 'Jane Doe', jobTitle: 'CGO', sameAs: ['https://linkedin.com/in/janedoe'] });
// personAudit.complete, personAudit.issues
```

## Claim types detected

Dollar amounts, percentages, bulletin/model-code patterns (`[A-Z]{1,3}-\d{2}-\d{2,3}`, e.g.
"T-23-04"), and specific-count claims ("1,200 customers"). A claim counts as sourced if a
real URL appears within 200 characters of it in the text.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real CMS publish pipeline.
