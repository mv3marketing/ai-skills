# GEO Trust-Signal / Claim Provenance Auditor

Real regex-based numeric-claim detection lacking inline sourcing, plus Person schema
completeness checks.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/geo-trust-signal-claim-provenance-auditor/).

## Quick start

```js
const { auditClaimProvenance, auditPersonSchema } = require('./auditor.js');
const contentAudit = auditClaimProvenance(pageText);
const personAudit = auditPersonSchema(personSchemaObject);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 15/15 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
