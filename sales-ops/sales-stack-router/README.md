# MV3 Sales Stack Router

[![License](https://img.shields.io/badge/License-MIT-blue)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-12%2F12%20passing-brightgreen)](./test.js)
[![Dependencies](https://img.shields.io/badge/Dependencies-0-brightgreen)](./router.js)
[![Schema](https://img.shields.io/badge/Schema-2020--12-informational)](./capability-manifest.schema.json)

Decides which connected sales-engagement MCP server (Outreach, Salesloft, Apollo, or any other) should handle a given request — instead of hardcoding one tool or fanning out to all of them.

Built and maintained by **Jordan Reeves**, ABM & Outbound Pipeline, MV3 Marketing. Part of the [MV3 AI Skills Marketplace](https://www.mv3marketing.com/ai-skills/).

## What this is (and isn't)

Documentation + a decision function, not a hosted service or an MCP server itself. It runs entirely in your own environment against a manifest **you** supply — it never calls any sales-engagement API directly.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | The skill definition — load into Claude Code/Desktop/an MCP agent |
| `router.js` | Zero-dependency routing engine — the `route()` function |
| `capability-manifest.schema.json` | JSON Schema (2020-12) describing the manifest shape `route()` expects |
| `example-manifest.json` | Illustrative example manifest — **placeholder rate-limit values, not verified vendor limits** |
| `test.js` | 12-test suite covering routing, rate-limit fallback, scope gating, and edge cases |

## Quick start

```bash
git clone https://github.com/mv3marketing/ai-skills.git
cd ai-skills/sales-ops/sales-stack-router
node test.js
```

```js
const { route } = require('./router.js');
const manifests = require('./example-manifest.json').manifests;

const result = route({ capability: 'contact.enrich' }, manifests);
console.log(result.decision, '→', result.pick);
```

## Security & validation

Verified 2026-08-12: zero dependencies (`npm audit` not applicable — no installed packages), `node test.js` 12/12 passing. The function never reads the system clock or makes network calls; all state (usage counts) is caller-supplied, which keeps it deterministic and safe to unit test.

## Support

[GitHub Issues](https://github.com/mv3marketing/ai-skills/issues) for bugs/questions. [Book a scoping call](https://www.mv3marketing.com/book/) ($175/hr) to wire this into your real connected MCP servers.

## License

MIT
