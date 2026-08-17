---
name: server-side-conversion-architecture-designer
description: Designs CAPI/Enhanced Conversions/GTM-SS deduplication architecture - a deterministic event-ID generator (FNV-1a, zero dependencies) so client and server compute the same dedup key independently, a dedup-pair validator that catches real mismatches, and a consent-to-channel eligibility mapper. Use when standing up server-side conversion tracking for a client's exact stack.
---

# Server-Side Conversion Architecture Designer

Reconciles dedup keys and consent-mode mapping - real architecture, not a snippet. Most
"wire up CAPI" guides skip the actual hard part: making sure the client-side pixel and the
server-side API call for the SAME conversion compute an identical dedup key independently,
without passing state between them, and respect the user's actual consent choice per channel.

## What this is (and isn't)

Pure functions over event/consent data you supply, not a hosted service or a live tag-manager
integration.

## Files

| File | Purpose |
|---|---|
| `designer.js` | `generateEventId()`, `validateDedupPair()`, `mapConsentToChannels()`, plus exported `fnv1a()` — zero dependencies |
| `test.js` | 17-test suite covering deterministic ID generation, bucket boundaries, dedup validation, and consent mapping |

## How to use it

```js
const { generateEventId, validateDedupPair, mapConsentToChannels } = require('./designer.js');

// Both the client pixel and the server API call independently generate
// the same event_id for the same real-world event:
const eventId = generateEventId('order-123', 'Purchase', Date.now());

// Validate a real client/server pair before shipping:
const check = validateDedupPair(clientEvent, serverEvent);
// check.willDedup, check.issues

// Determine which channels can receive this event given real consent:
const routing = mapConsentToChannels({ ad_storage: true, analytics_storage: false });
// routing.eligible, routing.blocked
```

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help wiring
this into your real GTM Server-Side container and consent management platform.
