# Churn Risk Cohort Survival Analyzer

Computes real customer retention curves using the Kaplan-Meier product-limit estimator,
correctly handling customers who haven't churned yet. Compares retention across cohorts.

Free, tested Claude Skill from [MV3 Marketing's AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/churn-risk-cohort-survival-analyzer/).

## Quick start

```js
const { computeKaplanMeierCurve, compareCohortSurvival } = require('./survival.js');
const curve = computeKaplanMeierCurve(customers);
const byCohort = compareCohortSurvival(customersWithCohortField);
```

See `SKILL.md` for the full write-up. Run `node test.js` — 14/14 passing.

## License

MIT. Free to install and run yourself. MV3 charges $175/hr only for implementation help.
