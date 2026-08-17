# Topical Authority Build-Sequencer

Real iterative PageRank over your link graph, sequences build order by internal equity from
already-built pages.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/topical-authority-build-sequencer/).

## Quick start

```js
const { sequenceBuild } = require('./sequencer.js');
const sequence = sequenceBuild(builtPageIds, unbuiltPageIds, plannedEdges);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 12/12 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
