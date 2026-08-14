# Citation-Leakage Mapper

Finds topics where a competitor is AI-cited while your own site has strong topical coverage
yet is never cited.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/citation-leakage-mapper/).

## Quick start

```js
const { findCitationLeakage } = require('./mapper.js');
const leaks = findCitationLeakage(ourPages, citations, ourDomain, { similarityThreshold: 0.4 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 14/14 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
