# Media-Mix Incrementality Test Designer

Real sample-size power calculation, balanced geo test/control split, and duration estimate
for incrementality testing.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/media-mix-incrementality-test-designer/).

## Quick start

```js
const { computeRequiredSampleSize, splitGeosForTest, estimateTestDurationDays } = require('./designer.js');
const requiredN = computeRequiredSampleSize(baselineRate, mde, { power: 0.8, alpha: 0.05 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 18/18 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
