# AI-Persona / Author-Entity Consistency Auditor

Catches duplicate persona photos, byline title drift, and thin bios sitewide.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/ai-persona-author-entity-consistency-auditor/).

## Quick start

```js
const { auditPersonaConsistency } = require('./auditor.js');
const report = auditPersonaConsistency({ personas, pageRecords });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 14/14 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
