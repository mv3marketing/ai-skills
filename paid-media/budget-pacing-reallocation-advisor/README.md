# Budget Pacing & Reallocation Advisor

Recommends specific dollar budget moves with real guardrails against learning-phase resets.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/budget-pacing-reallocation-advisor/).

## Quick start

```js
const { recommendBudgetChange } = require('./advisor.js');
const result = recommendBudgetChange(campaign, { maxChangePercent: 0.2, learningPhaseCooldownDays: 7 });
```

See `SKILL.md` for the full write-up. Run `node test.js` — 16/16 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
