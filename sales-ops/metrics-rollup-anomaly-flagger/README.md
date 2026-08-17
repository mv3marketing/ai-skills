# Metrics Rollup & Anomaly Flagger

Normalizes sequence performance across platforms with different reply/open definitions
and flags real statistical anomalies using a robust median+MAD modified z-score.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/metrics-rollup-anomaly-flagger/).

## Quick start

```js
const { rollupMetrics, detectAnomalies } = require('./flagger.js');
const rollup = rollupMetrics([{ platform: 'Outreach', sent: 1000, opens: 300, replies: 50 }]);
const anomalies = detectAnomalies(series);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 26/26 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
