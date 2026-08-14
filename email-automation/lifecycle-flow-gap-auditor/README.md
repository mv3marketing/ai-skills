# Lifecycle Flow Gap Auditor

Parses a lifecycle/workflow definition into a graph, finds unreachable nodes, dead-ends, and
wait/delay steps with no guaranteed timeout path.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/lifecycle-flow-gap-auditor/).

## Quick start

```js
const { auditFlow } = require('./auditor.js');
const result = auditFlow({ entryNodeId, nodes, edges });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 12/12 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
