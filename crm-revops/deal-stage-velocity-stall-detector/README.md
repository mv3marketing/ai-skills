# Deal Stage Velocity & Stall Detector

Flags deals stalled in their current pipeline stage using real per-stage historical
benchmarks (quartiles + Tukey's IQR outlier fence), and projects expected close dates.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/deal-stage-velocity-stall-detector/).

## Quick start

```js
const { computeStageBenchmarks, evaluateDealStall } = require('./detector.js');
const benchmarks = computeStageBenchmarks(closedDeals);
const result = evaluateDealStall(openDeal, benchmarks);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 19/19 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
