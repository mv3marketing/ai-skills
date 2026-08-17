# Server-Side Conversion Architecture Designer

Deterministic dedup-key generation, dedup-pair validation, and consent-to-channel mapping for
CAPI/Enhanced Conversions/GTM-SS.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/server-side-conversion-architecture-designer/).

## Quick start

```js
const { generateEventId, validateDedupPair, mapConsentToChannels } = require('./designer.js');
const eventId = generateEventId(orderId, eventName, timestampMs);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 17/17 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
