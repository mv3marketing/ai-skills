---
name: cross-tool-suppression-consent-ledger-sync
description: Builds one canonical do-not-contact ledger from multiple outbound tools' exported suppression lists - normalizes email/phone identifiers so the same contact is recognized across formatting differences, applies most-restrictive-wins conflict resolution when tools disagree, and outputs a concrete per-tool sync plan for every compliance gap found. Use when reconciling suppression lists across sales engagement, email, and CRM tools.
---

# Cross-Tool Suppression & Consent Ledger Sync

A reconciliation engine, not a live integration with any specific tool's suppression API.
You export each tool's current suppression list (however that tool lets you export it),
feed the exports in, and get back one canonical ledger plus a concrete list of exactly
which contact needs adding to which tool.

## What this is (and isn't)

A pure function over the suppression data you supply. Not a hosted service and not a
direct connection to any real vendor's suppression API — those differ per platform and
change over time.

## Files

| File | Purpose |
|---|---|
| `ledger.js` | `normalizeIdentifier()`, `mergeSuppressionRecords()`, `buildConsentLedger()`, `computeSyncPlan()` — zero dependencies |
| `test.js` | 27-test suite covering identifier normalization, precedence conflict resolution, gap detection, and sync-plan generation |

## How to use it

```js
const { buildConsentLedger, computeSyncPlan } = require('./ledger.js');

const { ledger, gaps } = buildConsentLedger({
  Outreach: [{ identifier: 'Jane+Sales@Company.com', type: 'email', reason: 'unsubscribe', suppressedAt: '2026-01-01' }],
  Salesloft: [{ identifier: 'jane@company.com', type: 'email', reason: 'hard_bounce', suppressedAt: '2026-01-05' }],
  HubSpot: [], // never got the suppression -- this is the real gap
});

// ledger -> one entry per normalized contact, canonical reason + earliest date
// gaps -> [{ identifier: 'jane@company.com', suppressedIn: [...], missingFrom: ['HubSpot'], canonicalReason: 'hard_bounce' }]

const plan = computeSyncPlan(gaps);
// plan.HubSpot -> [{ identifier: 'jane@company.com', reason: 'hard_bounce' }]
```

## The two real guardrails

1. **Identifier normalization** — the same contact shows up as `Jane+Sales@Company.com`
   in one tool and `jane@company.com` in another, or `(555) 123-4567` vs `+15551234567`.
   A literal-string merge treats these as different people and silently misses real
   overlap. Plus-addressing is stripped from email; phone numbers normalize to E.164
   for unambiguous 10/11-digit US formats and already-`+`-prefixed international
   numbers — genuinely ambiguous formats throw rather than guessing.
2. **Most-restrictive-wins conflict resolution** — when the same contact is suppressed
   for different reasons in different tools, the canonical record keeps the most severe
   reason (a `SUPPRESSION_PRECEDENCE` table: GDPR erasure > complaint/manual DNC > hard
   bounce/unsubscribe > soft bounce) but the earliest timestamp across all of them, since
   that's when the contact actually first opted out. A `gdpr_erasure` reason anywhere
   also sets `requiresErasureReview: true` — a routing signal for human/legal follow-up,
   not legal advice.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real tools' actual suppression-list export/import APIs.
