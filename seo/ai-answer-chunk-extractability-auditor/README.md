# AI Answer-Chunk Extractability Auditor

Simulates how a RAG engine chunks a page for retrieval and scores each chunk for
self-containedness.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/ai-answer-chunk-extractability-auditor/).

## Quick start

```js
const { auditChunks } = require('./auditor.js');
const results = auditChunks(chunkTexts); // [{ index, score, band, issues }, ...]
```

See `SKILL.md` for the full write-up. Run `node test.js` — 14/14 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
