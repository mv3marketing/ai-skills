# Winback Sequence Architect

Decides when to trigger a winback attempt (tiered by engagement history), whether it's safe
to send given real deliverability risk, and when to suppress instead of emailing forever.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/winback-sequence-architect/).

## Quick start

```js
const { planWinback } = require('./architect.js');
const result = planWinback(customer, domainRisk);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 15/15 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
