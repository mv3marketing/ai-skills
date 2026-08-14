# CRM Pipeline Hygiene Auditor

Flags stale deals against per-stage-velocity thresholds, missing fields, fuzzy-match dupes,
and stage-skip anomalies — one prioritized cleanup list.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/crm-pipeline-hygiene-auditor/).

## Quick start

```js
const { auditPipeline } = require('./auditor.js');
const result = auditPipeline(deals, config);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 15/15 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
