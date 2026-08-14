# Send-Time Model Explainer

Recency-weighted hour x weekday engagement histogram with a minimum-sample-size guard,
recommends a specific send window with a plain-English rationale.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/send-time-model-explainer/).

## Quick start

```js
const { explainSendTime } = require('./explainer.js');
const result = explainSendTime(engagementEvents, asOfISO, { halfLifeDays: 30, minSampleSize: 10 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 12/12 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
