# GA4 Anomaly Root-Cause Narrator

Cross-references a GA4 metric anomaly against GSC/GTM/ad-spend events, ranking candidate
causes by timing proximity and category prior — separates "tracking broke" from "real
demand shift."

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/ga4-anomaly-root-cause-narrator/).

## Quick start

```js
const { narrateAnomaly } = require('./narrator.js');
const result = narrateAnomaly(anomalyDateISO, candidateEvents);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 12/12 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
