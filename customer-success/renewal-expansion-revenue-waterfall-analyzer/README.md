# Renewal & Expansion Revenue Waterfall Analyzer

Builds a real ARR waterfall bridge and computes NRR and GRR using their correct,
distinct SaaS metric definitions.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/renewal-expansion-revenue-waterfall-analyzer/).

## Quick start

```js
const { buildRevenueWaterfall } = require('./waterfall.js');
const result = buildRevenueWaterfall(accounts);
// result.nrr, result.grr, result.byAccount
```

See `SKILL.md` for the full write-up. Run `node test.js` — 19/19 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
