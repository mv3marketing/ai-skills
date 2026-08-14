# Deliverability Pre-Flight Gate

Blocks a planned outbound send before it goes out if it would push a domain past safe
volume thresholds — domain-age ramp stage, SPF/DKIM/DMARC, and recent bounce/complaint rates.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/deliverability-pre-flight-gate/).

## Quick start

```js
const { evaluateSend } = require('./gate.js');
const result = evaluateSend(domainInfo, plannedVolume);
// result.allow, result.reason, result.dailyCap, result.warnings
```

See `SKILL.md` for the full write-up. Run `node test.js` — 15/15 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
