# Creative Fatigue & Refresh-Timing Analyzer

Fits an exponential decay curve to CTR vs. days-live and projects the specific calendar
date a creative will cross a fatigue threshold.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/creative-fatigue-refresh-timing-analyzer/).

## Quick start

```js
const { fitDecayCurve, projectRefreshDate } = require('./analyzer.js');
const model = fitDecayCurve(ctrHistory);
const projection = projectRefreshDate(model, fatigueThreshold, launchDateISO);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 12/12 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
