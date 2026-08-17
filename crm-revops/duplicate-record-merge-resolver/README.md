# Duplicate Record Merge Resolver

Detects likely-duplicate CRM records with a weighted Jaro-Winkler composite score and
computes an explainable, field-by-field merge plan.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/duplicate-record-merge-resolver/).

## Quick start

```js
const { scoreDuplicateLikelihood, computeMergePlan } = require('./resolver.js');
const score = scoreDuplicateLikelihood(recordA, recordB);
if (score.isLikelyDuplicate) {
  const plan = computeMergePlan(recordA, recordB, recordA.updatedAt, recordB.updatedAt);
}
```

See `SKILL.md` for the full write-up. Run `node test.js` — 20/20 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
