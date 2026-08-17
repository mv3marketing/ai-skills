---
name: ai-persona-author-entity-consistency-auditor
description: Detects the same photo used for two different named personas, byline title drift for the same persona across pages, and thin bios sitewide - real set/group-by logic, not a manual sweep. Directly generalizes real incidents this exact codebase has hit (persona photo-uniqueness rule, title-drift RCA). Use before publishing any multi-author or AI-persona content system.
---

# AI-Persona / Author-Entity Consistency Auditor

Directly generalizes real problems MV3 has hit in production: two named personas sharing a
photo (a real trust-signal violation for GEO/E-E-A-T), the same persona's byline title
drifting across pages with no canonical source, and thin author bios.

## What this is (and isn't)

Three audit functions over persona/page data you supply, not a hosted service or a live CMS
scan — you export your author/byline data first; this skill audits it.

## Files

| File | Purpose |
|---|---|
| `auditor.js` | `detectDuplicatePhotos()`, `detectTitleDrift()`, `detectThinBios()`, `auditPersonaConsistency()` — zero dependencies |
| `test.js` | 14-test suite covering all three checks independently and combined |

## How to use it

```js
const { auditPersonaConsistency } = require('./auditor.js');

const report = auditPersonaConsistency({
  personas: [
    { personaId: 'jordan', name: 'Jordan Reeves', photoHash: 'abc123', bio: 'Real bio text...' },
  ],
  pageRecords: [
    { personaId: 'jordan', name: 'Jordan Reeves', title: 'ABM Lead', pageUrl: '/blog/post-1' },
  ],
});
// report.duplicatePhotos, report.titleDrift, report.thinBios
```

## Why this is a real gap

This skill generalizes two real incidents: a persona photo-uniqueness rule adopted after the
same face was used for two different named people, and a title-drift RCA after the same
persona's byline title was found inconsistent across pages with no single canonical source.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real CMS author/byline data.
