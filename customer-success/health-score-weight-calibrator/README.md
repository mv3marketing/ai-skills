# Health-Score Weight Calibrator

Statistically fits customer-health-score signal weights against real renewal/churn outcomes
via L2-regularized logistic regression — instead of hand-guessing weights in a config UI.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/health-score-weight-calibrator/).

## Quick start

```js
const { calibrateWeights, scoreAccount } = require('./calibrator.js');

const model = calibrateWeights(historicalAccounts); // [{ signals: {...}, churned: 0|1 }, ...]
const score = scoreAccount(liveAccountSignals, model); // 0-100, 100 = healthiest
```

See `SKILL.md` for the full write-up. Run `node test.js` — 14/14 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
