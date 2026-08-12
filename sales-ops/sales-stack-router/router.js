/**
 * Sales Stack Router
 * Decides WHICH connected MCP server should handle a given GTM request,
 * given each server's declared capabilities, scope tier, and live rate-limit usage.
 *
 * Zero dependencies. Pure functions, no network calls, no state held between calls
 * (the caller supplies current usage counts each time — this makes the router safe
 * to run inside any orchestration loop without needing to track its own state).
 */

const SCOPE_RANK = { read: 0, write: 1, destructive: 2 };

/**
 * @param {object} request
 *   @param {string} request.capability - e.g. "contact.enrich"
 *   @param {"read"|"write"|"destructive"} [request.min_scope="read"]
 *   @param {boolean} [request.allow_destructive=false]
 * @param {object[]} manifests - array of server capability manifests (see capability-manifest.schema.json)
 * @param {number} [now] - unix seconds; defaults to a caller-supplied clock, NEVER Date.now() internally
 *   (kept as an explicit param so this stays deterministic and testable — no hidden clock reads)
 * @returns {{decision: "route"|"rate_limited"|"no_capable_server", pick: object|null, fallback_chain: object[], reasoning: string[]}}
 */
function route(request, manifests, now) {
  if (!request || typeof request.capability !== 'string' || !request.capability) {
    throw new TypeError('request.capability is required and must be a non-empty string');
  }
  if (!Array.isArray(manifests)) {
    throw new TypeError('manifests must be an array');
  }
  const minScope = request.min_scope || 'read';
  const allowDestructive = request.allow_destructive === true;
  const reasoning = [];

  // Step 1: only servers that are actually connected right now.
  let pool = manifests.filter((m) => m.status === 'connected');
  reasoning.push(`${pool.length}/${manifests.length} servers are connected.`);

  // Step 2: only servers that declare the requested capability.
  pool = pool
    .map((m) => ({ manifest: m, cap: (m.capabilities || []).find((c) => c.name === request.capability) }))
    .filter((x) => x.cap);
  reasoning.push(`${pool.length} of those declare capability "${request.capability}".`);

  // Step 3: scope filtering — the capability's own required_scope must meet the
  // request's minimum, and destructive capabilities are excluded unless explicitly allowed.
  pool = pool.filter(({ cap }) => {
    const capRank = SCOPE_RANK[cap.required_scope];
    const minRank = SCOPE_RANK[minScope];
    if (capRank === undefined || minRank === undefined) return false;
    if (cap.required_scope === 'destructive' && !allowDestructive) return false;
    return capRank >= minRank;
  });
  reasoning.push(`${pool.length} remain after scope filtering (min_scope="${minScope}", allow_destructive=${allowDestructive}).`);

  if (pool.length === 0) {
    return { decision: 'no_capable_server', pick: null, fallback_chain: [], reasoning };
  }

  // Step 4: rate-limit filtering. A server whose usage_this_window has already
  // met/exceeded its declared max_calls is excluded from THIS call, but tracked
  // separately so we can report a useful retry_after instead of just failing silently.
  const rateLimited = [];
  const available = pool.filter(({ manifest }) => {
    const rl = manifest.rate_limit;
    if (!rl) return true; // no declared limit = treat as unbounded
    const overLimit = manifest.usage_this_window >= rl.max_calls;
    if (overLimit) rateLimited.push(manifest);
    return !overLimit;
  });

  if (available.length === 0) {
    const soonest = rateLimited.reduce((min, m) => {
      const retry = m.rate_limit.window_seconds;
      return min === null || retry < min ? retry : min;
    }, null);
    reasoning.push(`All ${rateLimited.length} capable server(s) are at their rate limit.`);
    return {
      decision: 'rate_limited',
      pick: null,
      fallback_chain: [],
      retry_after_seconds: soonest,
      reasoning,
    };
  }

  // Step 5: rank by declared priority (lower = preferred), tie-broken by
  // whichever server has the most remaining capacity in its current window —
  // this spreads load rather than hammering one server down to its limit.
  const ranked = available
    .map(({ manifest, cap }) => {
      const rl = manifest.rate_limit;
      const remaining = rl ? rl.max_calls - manifest.usage_this_window : Infinity;
      return { manifest, cap, remaining };
    })
    .sort((a, b) => {
      const pa = a.manifest.priority ?? 999;
      const pb = b.manifest.priority ?? 999;
      if (pa !== pb) return pa - pb;
      return b.remaining - a.remaining;
    });

  reasoning.push(
    `Ranked ${ranked.length} candidate(s); top pick is "${ranked[0].manifest.server_id}" ` +
      `(priority=${ranked[0].manifest.priority ?? 'unset'}, remaining_capacity=${ranked[0].remaining}).`
  );

  return {
    decision: 'route',
    pick: { server_id: ranked[0].manifest.server_id, platform: ranked[0].manifest.platform, capability: ranked[0].cap.name },
    fallback_chain: ranked.slice(1).map((r) => ({ server_id: r.manifest.server_id, platform: r.manifest.platform })),
    reasoning,
  };
}

module.exports = { route, SCOPE_RANK };
