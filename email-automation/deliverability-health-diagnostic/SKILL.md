---
name: deliverability-health-diagnostic
description: Parses raw SPF/DKIM/DMARC TXT records for real RFC-level syntax issues (not just presence booleans) - SPF's 10-DNS-lookup limit, permissive +all, revoked DKIM keys, weak DMARC p=none policy - plus a real linear-regression trend read on bounce/complaint history. Use when auditing a sending domain's actual authentication configuration, not just whether records exist.
---

# Deliverability Health Diagnostic

Most deliverability checks report SPF/DKIM/DMARC as present/absent booleans. This skill
actually parses the record syntax: SPF's real 10-DNS-lookup RFC 7208 limit, a permissive
`+all` mechanism, a DKIM key that's been explicitly revoked (empty `p=` tag), and a DMARC
policy sitting at `p=none` (monitoring only, no real enforcement).

## What this is (and isn't)

A parser and trend function over TXT record strings and rate history you supply, not a
hosted service or a live DNS resolver. You look up the records yourself; this skill parses
what you found.

## Files

| File | Purpose |
|---|---|
| `diagnostic.js` | `parseSpf()`, `parseDkim()`, `parseDmarc()`, `trendSlope()`, `diagnose()` — zero dependencies |
| `test.js` | 21-test suite covering real RFC-level syntax cases for all three record types |

## How to use it

```js
const { diagnose } = require('./diagnostic.js');

const result = diagnose({
  spfRecord: 'v=spf1 include:_spf.google.com -all',
  dkimRecord: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC',
  dmarcRecord: 'v=DMARC1; p=reject;',
  bounceHistory: [{ day: 0, rate: 0.008 }, { day: 1, rate: 0.006 }],
  complaintHistory: [{ day: 0, rate: 0.0004 }, { day: 1, rate: 0.0003 }],
});
// result.spf/dkim/dmarc.valid, .issues
// result.bounceTrend/complaintTrend -> negative = improving, positive = worsening
// result.healthy -> overall verdict
```

## Real gaps this catches

- SPF exceeding RFC 7208's 10-DNS-lookup limit (receiving servers may treat this as a
  permanent failure — most "SPF checker" tools miss this).
- `+all` or a missing terminal `all` mechanism.
- An empty DKIM `p=` tag, which means the key has been explicitly revoked, not just missing.
- A DMARC policy of `p=none` — technically present, but 2024 bulk-sender guidance
  recommends at least `quarantine`.
- Whether bounce/complaint rates are trending better or worse via real linear regression,
  not just today's snapshot.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real DNS lookups and ESP rate history so this runs automatically.
