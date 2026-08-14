# Deliverability Health Diagnostic

Real SPF/DKIM/DMARC syntax parsing (RFC 7208 lookup limits, revoked keys, weak policies) plus
a real linear-regression trend read on bounce/complaint history.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/deliverability-health-diagnostic/).

## Quick start

```js
const { diagnose } = require('./diagnostic.js');
const result = diagnose({ spfRecord, dkimRecord, dmarcRecord, bounceHistory, complaintHistory });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 21/21 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
