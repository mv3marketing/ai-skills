# Account Reach & Frequency Saturation Modeler

Models effective reach and frequency saturation across a target account's buying
committee using the standard diminishing-returns exposure curve from media-planning
theory, calibrated from your own historical engagement data.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/account-reach-frequency-saturation-modeler/).

## Quick start

```js
const { calibrateAttentionProbability, modelAccountReach } = require('./modeler.js');
const p = calibrateAttentionProbability(0.5, 4);
const result = modelAccountReach(contacts, p);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 21/21 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
