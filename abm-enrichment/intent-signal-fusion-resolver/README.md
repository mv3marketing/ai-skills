# Multi-Source Intent Signal Fusion & Conflict Resolver

Fuses intent signals from 2+ sources into one composite per-topic score using recency decay
and a noisy-OR combination, not naive summation.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/intent-signal-fusion-resolver/).

## Quick start

```js
const { fuseIntentSignals } = require('./resolver.js');
const fused = fuseIntentSignals(signals, asOfISO, { halfLifeDays: 14 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 14/14 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
