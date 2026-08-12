---
name: sales-stack-router
description: Decides which connected sales-engagement MCP server (Outreach, Salesloft, Apollo, or any other) should handle a given GTM request, based on declared capabilities, scope tier, and live rate-limit usage — instead of hardcoding one tool or calling all of them and hoping. Use when a team has 2+ sales-engagement MCP servers connected and needs a request routed to the right one automatically, with a fallback chain and a reason it can show its user.
---

# Sales Stack Router

## The problem this solves

Most teams now have more than one sales-engagement MCP server connected — Outreach, Salesloft, Apollo, plus whatever else got added along the way. Nothing decides *which one* should handle a given request. The two default behaviors are both bad: hardcode one tool (breaks the moment that tool is rate-limited or the account changes), or call every connected tool and let the user sort out duplicate results.

This skill is the missing decision layer: given a request (e.g. "enrich this contact", "add to a sequence") and a live manifest of what's connected, it returns one ranked pick, a fallback chain, and the reasoning behind the choice.

## How to use it

1. Build a manifest array — one entry per connected server — matching `capability-manifest.schema.json`. Each entry declares what that server can do (`capabilities`), what scope tier each capability needs (`read`/`write`/`destructive`), and the server's current rate-limit usage.
2. Call `route(request, manifests)` from `router.js`.
3. Act on the result:

```js
const { route } = require('./router.js');
const result = route({ capability: 'contact.enrich', min_scope: 'read' }, manifests);

if (result.decision === 'route') {
  // call result.pick.server_id; if it fails mid-call, retry against
  // result.fallback_chain[0] before giving up
} else if (result.decision === 'rate_limited') {
  // every capable server is over its limit — wait result.retry_after_seconds
} else {
  // 'no_capable_server' — nothing connected can do this; surface that honestly
}
```

## Why scope tiers matter

Every capability declares a `required_scope` of `read`, `write`, or `destructive`. By default, `destructive` capabilities (deleting a prospect, purging a sequence) are never routed unless the caller explicitly passes `allow_destructive: true` on the request. This mirrors MV3's own MU-plugin governance pattern — destructive actions need an explicit opt-in, not an implicit one, see `example-manifest.json`'s `prospect.delete` entry.

## What it does NOT do

It doesn't call any API itself — it's a pure decision function, zero network calls, zero dependencies. You still own the actual MCP tool call; this just tells you which server to call and why. It also doesn't cache or remember usage between calls — you pass fresh `usage_this_window` counts each time, so it stays safe to call from inside any orchestration loop without drifting out of sync with reality.

## Testing

```bash
node test.js
```

12 tests: priority ranking, rate-limit fallback, degraded-server exclusion, destructive-scope gating (both blocked and explicitly-allowed paths), full-rate-limit exhaustion with retry timing, unknown-capability handling, priority-tie capacity tie-breaking, input validation, unbounded (no rate limit declared) servers, and fallback-chain completeness.

**Verified 2026-08-12:** 12/12 passing, 0 dependencies, `npm audit` not applicable (no package.json / no installed packages).

## Multi-tool support

Zero dependencies, pure JS — runs in Claude Code, Claude Desktop, any MCP-compatible agent, or standalone in any Node environment.

## Support

Open an issue on [GitHub Issues](https://github.com/mv3marketing/ai-skills/issues) for bugs or questions. Want this wired into your actual connected MCP servers? [Book a scoping call](https://www.mv3marketing.com/book/) ($175/hr).

## License

MIT
