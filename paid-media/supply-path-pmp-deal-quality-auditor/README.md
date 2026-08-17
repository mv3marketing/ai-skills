# Supply Path & PMP Deal Quality Auditor

Real compounding-fee computation and redundant-path detection for programmatic supply
chains.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/supply-path-pmp-deal-quality-auditor/).

## Quick start

```js
const { auditSupplyPaths } = require('./auditor.js');
const audit = auditSupplyPaths(supplyPaths, { maxHops: 2 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 13/13 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
