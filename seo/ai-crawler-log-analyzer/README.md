# MV3 AI Crawler Log-File Behavior Analyzer

[![License](https://img.shields.io/badge/License-MIT-blue)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-13%2F13%20passing-brightgreen)](./test.js)
[![Dependencies](https://img.shields.io/badge/Dependencies-0-brightgreen)](./analyzer.js)

Analyzes real server access logs to see how AI crawlers (GPTBot, ClaudeBot, PerplexityBot, and others) actually behave on your site, not just what your robots.txt allows.

Built and maintained by **Ryan Brooks**, Technical SEO, MV3 Marketing. Part of the [MV3 AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/).

## What this is (and isn't)

Documentation + a log-parsing and analysis engine, not a hosted service or a live-monitoring dashboard. You run this against your own exported log files; nothing leaves your environment.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | The skill definition |
| `parser.js` | Zero-dependency combined-log-format parser |
| `analyzer.js` | Bot identification, coverage, error-rate, and trend analysis |
| `known-bots.json` | Dated, sourced list of known AI-crawler user-agent substrings |
| `test.js` | 13-test suite |

## Quick start

```bash
git clone https://github.com/mv3marketing/ai-skills.git
cd ai-skills/seo/ai-crawler-log-analyzer
node test.js
```

```js
const { parseLog } = require('./parser.js');
const { analyze } = require('./analyzer.js');
const fs = require('fs');

const { entries } = parseLog(fs.readFileSync('access.log', 'utf8'));
const report = analyze(entries);
console.log(JSON.stringify(report, null, 2));
```

## Security & validation

Verified 2026-08-12: zero dependencies (`npm audit` not applicable), `node test.js` 13/13 passing, including a test that caught and fixed a real path-normalization bug during development (documented in `SKILL.md`).

## Support

[GitHub Issues](https://github.com/mv3marketing/ai-skills/issues) for bugs/questions. [Book a scoping call](https://www.mv3marketing.com/book/) ($175/hr) to run this against your real logs on a schedule.

## License

MIT
