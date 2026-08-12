# MV3 BANT Lead Scoring Model

[![License](https://img.shields.io/badge/License-MIT-blue)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-8%2F8%20passing-brightgreen)](./test.js)
[![Dependencies](https://img.shields.io/badge/Dependencies-0-brightgreen)](./calibrate.js)
[![Method](https://img.shields.io/badge/Method-Point--biserial%20correlation-informational)](https://en.wikipedia.org/wiki/Point-biserial_correlation_coefficient)

Data-driven lead scoring calibrated to your own win/loss history, not generic best-practice weights.

Built and maintained by **Jordan Reeves**, ABM & Outbound Pipeline, MV3 Marketing. Part of the [MV3 AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/).

## What this is (and isn't)

Documentation + a calibration algorithm, not a hosted service. You run this against your own exported CRM data — nothing leaves your environment.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | The skill definition — load into Claude Code/Desktop/an MCP agent |
| `calibrate.js` | Zero-dependency point-biserial correlation engine |
| `test.js` | Synthetic dataset with a known ground truth, verifies the engine recovers it |

## Quick start

```bash
git clone https://github.com/mv3marketing/ai-skills.git
cd ai-skills/sales/bant-lead-scoring-model
node test.js
```

## Security & validation

Verified 2026-08-12: `npm audit` 0 vulnerabilities (zero dependencies), `node test.js` 8/8 passing — including a planted-ground-truth test (not just "does it run"), a small-sample-warning test, and a constant-value edge case that must return 0 correlation, not `NaN`.

## Support

[GitHub Issues](https://github.com/mv3marketing/ai-skills/issues) for bugs/questions. [Book a scoping call](https://www.mv3marketing.com/book/) ($175/hr) to run this against your real CRM export.

## License

MIT
