# saasseo.com → mv3marketing.com 301 migration

Redirect map and deployable configs for retiring **saasseo.com** into
**www.mv3marketing.com**.

## Current state (measured 2026-09-16)

| Check | Result |
|---|---|
| `https://saasseo.com/` | **500** |
| `https://www.saasseo.com/` | **403** |
| DNS | Cloudflare (`mona`/`brett.ns.cloudflare.com`), proxied |
| Origin | WP Engine (`wp.wpenginepowered.com`) |
| Organic traffic | 0 (was ~2/mo before takedown) |
| Organic keywords | 0 |
| **Referring domains → `https://saasseo.com/`** | **634** |

Two things follow from this.

**The homepage is the whole asset.** 634 of the ~640 referring domains point at
`https://saasseo.com/` itself. Every other URL on the site has 0–2 referring
domains. If only one redirect ever ships, it is the homepage one.

**The current 500/403 is actively destroying that asset.** A 5xx tells Google
"come back later" and a 403 tells it "you're not allowed" — neither passes any
link equity, and after enough repeat crawls the URLs get dropped and the 634
domains stop counting for anything. This is strictly worse than a 404 and far
worse than a 301. It is the reason to treat this as urgent rather than tidy-up.

## Why this deploys at Cloudflare, not WP Engine

Cloudflare Redirect Rules and Bulk Redirects are evaluated **at the edge, before
the origin fetch**. The WP Engine origin can stay dead — the redirect still
fires. That means:

- No need to bring the WordPress install back up.
- No need to keep paying for the WP Engine plan just to serve redirects.
- The 403 (WAF/host-level) and 500 (origin) both stop mattering, because
  neither response is ever reached.

**Do not delete the saasseo.com DNS records.** The A records must stay in place
and stay **proxied (orange cloud)** or the edge has nothing to run the rules on
and the domain simply goes dark.

## What's in here

| File | What it is |
|---|---|
| `redirect-map.csv` | Source of truth: 167 source→target pairs with tier + rationale |
| `cloudflare-bulk-redirects.csv` | Import straight into Cloudflare Bulk Redirects |
| `cloudflare-redirect-rules.md` | Redirect Rules variant — collapses 64 rows into one regex rule |
| `nginx-redirects.conf` | Origin-level fallback (nginx) |
| `htaccess-redirects.txt` | Origin-level fallback (Apache / WP Engine) |
| `build_map.py` | Regenerates every output above from the mapping tables |
| `glossary-unmatched.txt` | 62 glossary terms with no MV3 equivalent — see caveat below |
| `target-verification.txt` | HTTP status of all 121 unique targets at build time |
| `matched.txt`, `mv3-glossary-slugs.txt` | Input data for the generator |

## How the map was built

**Tier 1 — 65 money pages**, hand-mapped by search intent rather than slug
similarity. `/saas-seo-agency/` → `/ai-seo-agency/`, `/abm/` → `/abm-agency/`,
`/saas-website-migration/` → `/site-migrations/`, and so on.

**Tier 2 — 102 glossary URLs.** Both sites run a `/glossary/` section, so slugs
were compared directly:

- **64** are identical on both sites → 1:1.
- **36** exist on MV3 under a different slug → mapped explicitly
  (`nrr` → `net-revenue-retention`, `pay-per-click` → `ppc`,
  `return-on-ad-spend` → `roas`, `rag-retrieval-augmented-generation` →
  `retrieval-augmented-generation`).
- **2** are really service pages, not definitions (`programmatic-seo`,
  `technical-seo-audit`).

Fuzzy matching proposed a further batch that was **rejected on review** —
`chatgpt-seo → seo`, `bing-seo → seo`, `total-contract-value →
average-contract-value`, `pay-per-click → earnings-per-click`. A 301 to a page
that doesn't answer the query is worse than a clean fallback, so these fall
through to `/glossary/` instead.

**Tier 3 — everything else** is handled by pattern fallbacks (`/case-study/*`,
`/category/*`, `/author/*`, `/guide/*`) and a catch-all. The catch-all points at
`/blog/`, **not** the homepage: nearly every remaining saasseo URL is a retired
blog post, and mass-redirecting deep content to a homepage is the textbook
trigger for Google treating the whole batch as soft 404s.

### Verification

All **121 unique targets return HTTP 200** — no 404s and no redirect chains.
One chain was found and fixed during the build: MV3 serves `/glossary/icp/` as a
301 to `/glossary/icp-ideal-customer-profile/`, so the map points straight at
the destination.

Re-run `python3 build_map.py` after editing the tables in the script; it fails
loudly if a synonym target no longer exists on MV3.

## Deploying

### Option A — Bulk Redirects (simplest, exact map)

1. Cloudflare dashboard → **Account Home → Bulk Redirects → Create a list**.
2. Import `cloudflare-bulk-redirects.csv`.
3. Create a Bulk Redirect Rule bound to that list.
4. Add a final catch-all Redirect Rule (rule 5 in
   `cloudflare-redirect-rules.md`) so unlisted URLs don't fall through to the
   dead origin.

Bulk Redirect list size is capped by plan. If 167 rows don't fit the current
plan, use Option B — verify the limit in the dashboard before assuming.

### Option B — Redirect Rules (fewer rules, no list needed)

Follow `cloudflare-redirect-rules.md`. The ordering is load-bearing: the
exception rules must evaluate before the generic `/glossary/` regex, and the
catch-all must be last.

### Option C — origin level

Use `nginx-redirects.conf` or `htaccess-redirects.txt` only if the redirects
must live on WP Engine. This requires keeping the origin alive and paid for,
which is why it's the fallback rather than the recommendation.

## Caveat on the generic glossary rule

Rule 3 in the Redirect Rules file maps `/glossary/<slug>/` → the same slug on
MV3 in a single rule. That is efficient but optimistic: Ahrefs only ever crawled
176 glossary URLs, and the site advertised 700+ terms, so **there are saasseo
glossary slugs this map has never seen**. Any of those that MV3 doesn't also
have will 301 into a 404.

Two ways to close that:

- Safer: replace rule 3 with a static redirect of `/glossary/*` → `/glossary/`,
  losing term-level precision but guaranteeing a 200.
- Better: pull the real URL inventory from Google Search Console
  (Pages → all known pages) or a WP Engine database export while it's still
  available, and regenerate. GSC keeps this for ~16 months after takedown —
  after that the inventory is gone for good.

The 62 terms in `glossary-unmatched.txt` are the ones already confirmed to have
no MV3 equivalent. They're candidates either for writing on mv3marketing.com or
for accepting the `/glossary/` fallback.

## After the redirects are live

1. **Verify** — `curl -sSI https://saasseo.com/` should return `301` with
   `location: https://www.mv3marketing.com/`. Spot-check a Tier 1 page, an exact
   glossary match, a synonym, and a random blog URL for the catch-all.
2. **Search Console → Change of Address** on the saasseo.com property, pointing
   at mv3marketing.com. This is the documented signal for a full-domain move and
   it materially speeds up consolidation. It requires the homepage redirect to
   be live first.
3. **Keep the saasseo.com domain registered and the Cloudflare zone active.**
   Redirect equity only flows while the redirect answers. Budget for this
   indefinitely — dropping the domain in 12 months discards the 634 domains.
4. **Leave the redirects in place permanently.** A year is the common rule of
   thumb for when Google has fully transferred signals; it is a floor, not an
   expiry date.
5. **Reclaim the links worth reclaiming.** 301s pass most but not all equity.
   The highest-value referring domains are worth an outreach pass to repoint
   directly at mv3marketing.com.
6. **Re-audit in ~30 days** — Ahrefs referring domains on mv3marketing.com
   should climb as the 634 consolidate.
