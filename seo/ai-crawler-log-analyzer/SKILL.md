---
name: ai-crawler-log-analyzer
description: Parses real server access logs to analyze how AI crawlers (GPTBot, ClaudeBot, PerplexityBot, and others) actually behave on your site, including crawl coverage against your real URL list, error-rate health, and crawl-frequency trend over time. Use when a team wants to know what AI crawlers are actually doing beyond just reading robots.txt rules, since every existing "AI crawler checker" only inspects static robots.txt directives, not real crawl behavior.
---

# AI Crawler Log-File Behavior Analyzer

## The gap this fills

Every AI-crawler checker tool found in research only reads a site's robots.txt rules and reports whether a bot is allowed or disallowed. None of them analyze what a bot actually does once it starts crawling: how much of the site it covers, whether it's hitting broken pages, or whether its interest is growing or declining over time. This skill answers those questions from your own real server logs.

## How to use it

1. Export your access logs in standard nginx/Apache combined log format (most hosts, including WP Engine, can provide this).
2. Optionally, export your full list of real site URLs (from your sitemap) if you want coverage analysis.
3. Run the analysis:

```js
const { parseLog } = require('./parser.js');
const { analyze } = require('./analyzer.js');

const { entries, skipped } = parseLog(logFileContents);
const report = analyze(entries, mySiteUrls); // siteUrls is optional

console.log(report.GPTBot);
// {
//   total_hits: 1204,
//   unique_urls_crawled: 340,
//   status_code_breakdown: { '200': 1150, '404': 54 },
//   error_rate_pct: 4.5,
//   date_range: { first: '2026-07-01', last: '2026-08-01' },
//   crawl_trend: { direction: 'rising', pct_change: 38.2 },
//   coverage: { site_urls_total: 412, site_urls_crawled: 340, coverage_pct: 82.5, never_crawled: [...] },
//   flags: []
// }
```

## What the flags mean

- **High error rate**: over 20% of a bot's requests returned 4xx/5xx. Usually means the bot is hitting stale/broken URLs, worth checking your internal links and redirect map.
- **Crawl frequency dropped**: average daily hits in the second half of your log window are 25%+ lower than the first half. Could mean the bot lost interest, hit a crawl-budget ceiling, or something changed in your robots.txt.
- **Low coverage**: fewer than 50% of your listed site URLs were crawled in this log window. Tells you which real pages a given bot has likely never seen, listed by URL in `coverage.never_crawled`.

## Known-bot list, and why it's a separate file

`known-bots.json` is deliberately kept separate from the analysis logic and dated. AI crawler user-agent strings change as vendors add new bots; treat this list as a starting point to verify against each vendor's current documentation, not a permanent source of truth. Update it directly if a vendor adds a new crawler.

## Testing

```bash
node test.js
```

13 tests: log parsing (including malformed-line handling), bot identification, coverage calculation against a real URL list, error-rate flagging (both triggered and not-triggered cases), crawl-trend detection (rising/dropping/insufficient-data), and multi-bot independence within one log. One real bug was caught and fixed during testing: an inconsistent path-normalization mismatch between crawled URLs and the supplied site URL list that silently produced a wrong `never_crawled` list.

**Verified 2026-08-12:** 13/13 passing, 0 dependencies.

## Multi-tool support

Zero dependencies, pure JS, runs in Claude Code, Claude Desktop, any MCP-compatible agent, or standalone in any Node environment.

## Support

Open an issue on [GitHub Issues](https://github.com/mv3marketing/ai-skills/issues). Want this run against your real server logs, on a schedule, with alerts? [Book a scoping call](https://www.mv3marketing.com/book/) ($175/hr).

## License

MIT
