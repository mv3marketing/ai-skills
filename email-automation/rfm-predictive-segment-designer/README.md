# RFM + Predictive Segment Designer

Real quantile-binning RFM scoring against your own customer distribution, plus a documented
segment rule layer.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/rfm-predictive-segment-designer/).

## Quick start

```js
const { scoreCustomers } = require('./segmenter.js');
const scored = scoreCustomers(customers); // [{ id, r, f, m, avgScore, segment }, ...]
```

See `SKILL.md` for the full write-up. Run `node test.js` — 14/14 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
