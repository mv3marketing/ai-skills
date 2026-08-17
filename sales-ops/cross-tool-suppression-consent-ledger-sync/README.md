# Cross-Tool Suppression & Consent Ledger Sync

Builds one canonical do-not-contact ledger from multiple outbound tools' exported
suppression lists, with real identifier normalization and most-restrictive-wins
conflict resolution.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/cross-tool-suppression-consent-ledger-sync/).

## Quick start

```js
const { buildConsentLedger, computeSyncPlan } = require('./ledger.js');
const { ledger, gaps } = buildConsentLedger({ ToolA: [...], ToolB: [...] });
const plan = computeSyncPlan(gaps);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 27/27 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
