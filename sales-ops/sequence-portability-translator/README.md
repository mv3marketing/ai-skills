# Sequence Portability Translator

Converts an outbound cadence between tool schemas via a declarative field-mapping
table, with real timing-unit conversion and step-graph validation (broken references,
unreachable steps, cycles).

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/sequence-portability-translator/).

## Quick start

```js
const { translateCadence } = require('./translator.js');
const result = translateCadence(sourceSequence, { targetTimingUnit: 'hours', fieldMap: {...}, typeMap: {...} });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 26/26 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
