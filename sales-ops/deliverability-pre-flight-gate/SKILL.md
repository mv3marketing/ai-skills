---
name: deliverability-pre-flight-gate
description: Blocks a planned outbound email send BEFORE it goes out if it would push a sending domain past safe volume thresholds, based on domain age ramp stage, SPF/DKIM/DMARC authentication, and recent bounce/complaint rates. Use before sending any bulk outbound campaign, especially on a newer domain.
---

# Deliverability Pre-Flight Gate

Sending-infrastructure territory, deliberately distinct from any conversational ai-sdr-*
skill: this never writes or sends a message. It only decides, before you send, whether a
planned volume is safe for the sending domain right now.

## What this is (and isn't)

A gate function you call before sending, not a hosted service, not an ESP integration, and
not a full domain-reputation ML model. It applies Google/Yahoo's published 2024 bulk-sender
guidance (gradual volume ramp by domain age, required authentication, bounce/complaint-rate
ceilings) as a conservative rule set — stated honestly, not oversold as more than that.

## Files

| File | Purpose |
|---|---|
| `gate.js` | `evaluateSend(domain, plannedVolume)` — zero dependencies |
| `test.js` | 15-test suite covering auth gating, ramp stages, bounce/complaint ceilings, and remaining-capacity math |

## How to use it

```js
const { evaluateSend } = require('./gate.js');

const domain = {
  ageDays: 21,
  spf: true, dkim: true, dmarc: true,
  recentDays: [
    { date: '2026-08-12', sent: 180, bounced: 2, complaints: 0 },
  ],
};

const result = evaluateSend(domain, 250);
// result.allow -> false
// result.reason -> "Planned volume 250 exceeds remaining safe capacity 20 for today..."
```

## What it checks, in order

1. **Authentication** — blocks entirely if SPF, DKIM, or DMARC is missing.
2. **Recent complaint rate** — blocks if the trailing-7-day complaint rate exceeds 0.3%.
3. **Recent bounce rate** — blocks if the trailing-7-day bounce rate exceeds 2%; halves the
   effective cap as a precaution if it's elevated but still under that ceiling.
4. **Ramp-stage cap by domain age** — a domain under 14 days old is capped at 50/day, scaling
   up to 5,000/day past 90 days, per Google/Yahoo's published bulk-sender ramp guidance.
5. **Remaining capacity today** — subtracts volume already sent today (from other campaigns
   on the same domain) before approving the new planned volume.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real sending infrastructure (Outreach, Salesloft, Instantly, or a custom sender) so it gates
sends automatically instead of being called by hand.
