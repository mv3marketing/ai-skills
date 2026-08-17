# Sample-Ratio-Mismatch (SRM) Auditor

Checks whether an A/B test's actual traffic split matches its intended assignment ratio
using a real chi-square goodness-of-fit test, before trusting any metric result.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/sample-ratio-mismatch-auditor/).

## Quick start

```js
const { detectSRM } = require('./srm.js');
const result = detectSRM(observedA, observedB, { expectedRatioA: 0.5 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 22/22 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
