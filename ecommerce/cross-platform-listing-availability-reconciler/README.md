# Cross-Platform Listing Availability Reconciler

Explains why sold items keep showing as available on other selling channels, by
separating ordinary sync lag from a missed sync, an active republisher, and an unmapped
platform status — then outputs a per-platform delist plan ranked by oversell risk.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/cross-platform-listing-availability-reconciler/).

## Quick start

```js
const { reconcileListings, summarizeByPlatform, buildDelistPlan } = require('./availability.js');
const { findings } = reconcileListings({ inventory, listings, syncWindowMinutes: { ebay: 60 } });
summarizeByPlatform(findings); // per-platform likelyCause
buildDelistPlan(findings);     // per-platform actions, worst-first
```

`pipeline.js` goes one level deeper and attributes each stuck listing to the stage that
broke — `detect` (the sale was never noticed), `dispatch` (quantity > 1, an active offer,
an unlinked listing) or `publish` (a relister recreated a sold item):

```js
const { runRootCauseAnalysis } = require('./pipeline.js');
const { ranked, stageShare } = runRootCauseAnalysis(incidents, { uptimeWindows });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 40/40 passing — and
`node test-pipeline.js` — 31/31 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
