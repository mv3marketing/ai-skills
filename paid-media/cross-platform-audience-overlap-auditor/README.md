# Cross-Platform Audience Overlap Auditor

Finds an account bidding against itself via real audience-signal overlap, exclusion-aware.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/cross-platform-audience-overlap-auditor/).

## Quick start

```js
const { findAudienceOverlaps } = require('./auditor.js');
const overlaps = findAudienceOverlaps(campaigns, { similarityThreshold: 0.3 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 12/12 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
