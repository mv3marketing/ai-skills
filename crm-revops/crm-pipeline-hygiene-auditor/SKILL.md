---
name: crm-pipeline-hygiene-auditor
description: Flags stale deals against per-stage-velocity thresholds (not a fixed day count), missing required fields, fuzzy-match duplicate deals, and stage-skip anomalies, output as a single prioritized cleanup list. Use when a CRM has accumulated real hygiene debt across Salesforce, HubSpot, Pipedrive, or Zoho.
---

# CRM Pipeline Hygiene Auditor

A CRM MCP server (Salesforce, HubSpot, Pipedrive, Zoho — all real and shipped as of this
research) can pull deal data. This skill is the obvious first consumer: a real audit against
your own historical stage velocity, not a generic "deals older than 30 days" rule.

## What this is (and isn't)

An audit function you run against exported deal data, not a hosted service or a CRM
integration itself. It runs entirely in your own environment.

## Files

| File | Purpose |
|---|---|
| `auditor.js` | `auditPipeline()`, plus exported `levenshtein()`/`similarity()` helpers — zero dependencies |
| `test.js` | 15-test suite covering staleness, missing fields, dupe detection, and stage-skip logic |

## How to use it

```js
const { auditPipeline } = require('./auditor.js');

const config = {
  stageOrder: ['Prospecting', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'],
  stageVelocityMedianDays: { Prospecting: 7, Qualified: 10, Proposal: 14, Negotiation: 10, 'Closed Won': 0 }, // from YOUR historical data
  requiredFields: ['amount', 'closeDate'],
};

const result = auditPipeline(deals, config);
// result.prioritized -> stage-skips and possible dupes first, then stale, then missing-field issues
```

## Why this is a real gap

A fixed "flag deals stale after 30 days" rule treats a fast-moving Prospecting stage the
same as a naturally slow Negotiation stage. This skill instead compares each deal's actual
days-in-stage against **your own historical median for that specific stage**, so the
threshold reflects how your pipeline actually moves.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real CRM (Salesforce, HubSpot, Pipedrive, or Zoho MCP) so the audit runs automatically.
