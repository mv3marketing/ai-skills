---
name: winback-sequence-architect
description: Decides WHEN to trigger a winback attempt (tiered by the customer's historical engagement level), WHETHER it's currently safe to send given the sending domain's real deliverability risk, and WHEN to suppress a customer who never re-engages, instead of "write a winback email" on a fixed timer. Use before running any re-engagement campaign.
---

# Winback Sequence Architect

Resolves a real tension generic prompts ignore: winback timing needs to account for the
customer's own history AND the sending domain's current health, or it risks damaging
deliverability while chasing customers unlikely to return.

## What this is (and isn't)

A decision function over a customer's engagement history and (optionally) live domain
risk metrics, not a hosted service or an ESP integration.

## Files

| File | Purpose |
|---|---|
| `architect.js` | `planWinback()` — zero dependencies |
| `test.js` | 15-test suite covering tiered triggers, spacing, suppression, and the deliverability gate |

## How to use it

```js
const { planWinback } = require('./architect.js');

const result = planWinback(
  { daysSinceLastEngagement: 50, historicalEngagementTier: 'high', priorWinbackAttempts: 0 },
  { bounceRate: 0.008, complaintRate: 0.0003 } // optional: current sending-domain health
);
// result.action -> 'too_early' | 'send_attempt' | 'suppress' | 'hold_for_deliverability'
// result.attemptNumber, result.reason
```

## The real tension this resolves

1. **Tiered trigger timing** — a customer who was highly engaged before going quiet gets a
   longer grace period (45 days) than one who was never very engaged (15 days), since their
   inactivity patterns mean different things.
2. **Real suppression** — after 3 winback attempts with no re-engagement, the skill
   recommends suppression instead of continuing to email indefinitely, a real list-hygiene
   practice that protects sender reputation.
3. **Deliverability gate** — even a customer who is due for a winback attempt gets held back
   if the sending domain's current bounce/complaint rate is already elevated, so a
   re-engagement push doesn't compound an existing deliverability problem.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real ESP and domain-health data.
