# A/B Significance Validator

Real two-proportion z-test that catches false-positive "winners" on underpowered A/B tests,
with a confidence interval and minimum-sample-size warning.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/ab-significance-validator/).

## Quick start

```js
const { twoProportionZTest } = require('./validator.js');
const result = twoProportionZTest(nA, xA, nB, xB, alpha);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 16/16 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
