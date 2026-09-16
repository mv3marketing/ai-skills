#!/usr/bin/env python3
"""
Build the saasseo.com -> mv3marketing.com 301 redirect map.

Emits:
  redirect-map.csv              canonical source-of-truth (source,target,tier,note)
  cloudflare-bulk-redirects.csv ready to import into Cloudflare Bulk Redirects
  nginx-redirects.conf          nginx map{} block for a WP Engine / origin-level rollout
  htaccess-redirects.txt        Apache equivalent

Run:  python3 build_map.py
"""
import csv, os

SRC = "https://saasseo.com"
DST = "https://www.mv3marketing.com"
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- tier 1
# Money pages and site sections. Hand-mapped to the closest MV3 page by
# search intent, not by slug similarity.
PAGES = {
    "/": "/",

    # --- core SEO service pages ---
    "/saas-seo-agency/":        "/ai-seo-agency/",
    "/saas-seo/":               "/ai-seo-agency/",
    "/saas-seo-consultant/":    "/ai-seo-agency/",
    "/seo-consultancy/":        "/ai-seo-agency/",
    "/seo/":                    "/services/seo/",
    "/seo-geo/":                "/services/seo/aeo/",
    "/saas-seo-strategy/":      "/services/seo/",
    "/saas-seo-guide/":         "/services/seo/",
    "/saas-keyword-research/":  "/services/seo/",
    "/seo-management-services/":"/seo-services/",
    "/saas-technical-seo/":     "/technical-seo/",
    "/audit-seo-saas/":         "/technical-seo-audit/",
    "/optimized-website-architecture/": "/technical-seo/",
    "/saas-website-migration/": "/site-migrations/",
    "/saas-organic-growth-ai-powered-seo/": "/ai-seo-agency/",
    "/saas-growth/":            "/services/",
    "/saas-seo-tools/":         "/blog/",

    # --- GEO / AI search ---
    "/geo-audit/":              "/geo-audit/",
    "/geo-optimization-for-saas/": "/services/seo/aeo/",

    # --- digital PR / link building ---
    "/digital-pr/":             "/digital-pr/",
    "/digital-pr-agency/":      "/digital-pr/",
    "/digital-pr-articles/":    "/digital-pr/",
    "/saas-link-building-agency/": "/digital-pr/",
    "/saas-linkbuilding-agency-why-you-need-one-now/": "/digital-pr/",

    # --- ABM ---
    "/abm/":                    "/abm-agency/",
    "/abm-advertising-agency/": "/abm-agency/",
    "/saas-abm-marketing/":     "/abm-agency/",

    # --- AI automation ---
    "/ai-automation/":          "/ai-automation/",
    "/ai-automation-articles/": "/ai-automation/",

    # --- paid media ---
    "/saas-ppc/":               "/ppc-management/",
    "/saas-ppc-agency/":        "/ppc-management/",
    "/paid-advertising/":       "/services/paid-media/",
    "/display-advertising/":    "/services/paid-media/",
    "/native-advertising/":     "/services/paid-media/",
    "/audio-advertising/":      "/services/paid-media/",
    "/digital-ooh-advertising/":"/services/paid-media/",
    "/in-game-advertising/":    "/services/paid-media/",
    "/holiday-marketing/":      "/services/paid-media/",

    # --- content ---
    "/content-marketing/":          "/content-marketing/",
    "/saas-content/":               "/content-marketing/",
    "/saas-content-marketing-strategy/": "/content-marketing/",
    "/saas-marketing-plan/":        "/services/",
    "/saas-marketing-tools/":       "/blog/",

    # --- company / conversion pages ---
    "/services/":            "/services/",
    "/pricing/":             "/pricing/",
    "/about-us/":            "/about/",
    "/contact/":             "/contact-us/",
    "/contact-us/":          "/contact-us/",
    "/book/":                "/book/",
    "/schedule-demo/":       "/book/",
    "/partners/":            "/agency-partnership/",

    # --- proof / social proof ---
    "/case-studies/":        "/case-studies/",
    "/case-study/":          "/case-studies/",
    "/case-study-results/":  "/case-studies/",
    "/clients/":             "/case-studies/",
    "/results/":             "/results/",

    # --- content hubs ---
    "/blog/":                "/blog/",
    "/news/":                "/blog/",
    "/guide/":               "/resources/",
    "/glossary/":            "/glossary/",

    # --- legal / boilerplate ---
    "/privacy-policy/":              "/",
    "/cookie-policy/":               "/",
    "/do-not-sell-my-information/":  "/",
    "/accessibility/":               "/",
}

# Glossary terms that exist on MV3 under a different slug. Only genuine
# synonyms / acronym expansions - a wrong 301 is worse than a good fallback,
# so anything ambiguous falls through to /glossary/ instead.
GLOSSARY_SYNONYMS = {
    "abm":                                "account-based-marketing",
    "account-based-advertising":          "account-based-marketing",
    "ai-citation":                        "ai-citation-optimization",
    "ai-content-generation":              "ai-content",
    "alt-text":                           "alt-text-seo",
    "broad-match":                        "broad-match-keyword",
    "cac-payback-period":                 "payback-period",
    "canonical-tag":                      "canonical",
    "churn-prediction":                   "churn-prevention",
    "competitive-backlink-analysis":      "competitive-analysis",
    "competitor-analysis-seo":            "competitor-seo-analysis",
    "cost-per-acquisition-cpa":           "cost-per-acquisition",
    "cost-per-click-cpc":                 "cost-per-click",
    "cost-per-lead-cpl":                  "cost-per-lead",
    "crawl-depth":                        "crawl-budget",
    "customer-journey-abm":               "customer-journey",
    "customer-match-ads":                 "customer-match",
    "display-retargeting":                "retargeting",
    "ecpc-enhanced-cpc":                  "enhanced-cpc",
    "geo-generative-engine-optimization": "geo",
    "google-algorithm-updates":           "google-algorithm-update",
    "gsc-google-search-console":          "google-search-console",
    "helpful-content":                    "helpful-content-update",
    "ideal-customer-profile":             "icp-ideal-customer-profile",
    # MV3 serves /glossary/icp/ as a 301 to the expanded slug; point straight
    # at the destination so we never ship a redirect chain.
    "icp":                                "icp-ideal-customer-profile",
    "in-market-accounts":                 "in-market-audiences",
    "indexability":                       "index-coverage",
    "nrr":                                "net-revenue-retention",
    "pay-per-click":                      "ppc",
    "press-release":                      "press-release-distribution",
    "quality-score-improvement":          "quality-score",
    "rag-retrieval-augmented-generation": "retrieval-augmented-generation",
    "retargeting-window":                 "retargeting",
    "return-on-ad-spend":                 "roas",
    "sales-cycle-abm":                    "sales-cycle",
    "tam-total-addressable-market":       "tam-sam-som",
}

# Glossary terms that map to a full MV3 service page rather than a definition.
GLOSSARY_TO_PAGE = {
    "programmatic-seo":    "/programmatic-seo/",
    "technical-seo-audit": "/technical-seo-audit/",
}


def load(name):
    p = os.path.join(HERE, name)
    with open(p) as fh:
        return [l.strip() for l in fh if l.strip()]


def build():
    rows = []            # (source_path, target_path, tier, note)
    seen = set()

    def add(src, dst, tier, note):
        if src in seen:
            return
        seen.add(src)
        rows.append((src, dst, tier, note))

    # Tier 1 - money pages
    for s, d in PAGES.items():
        add(s, d, "1-page", "hand-mapped by search intent")

    # Tier 2b - glossary synonyms
    mv3 = set(load("mv3-glossary-slugs.txt"))
    for old, new in sorted(GLOSSARY_SYNONYMS.items()):
        if new not in mv3:
            raise SystemExit(f"synonym target missing on MV3: {new}")
        add(f"/glossary/{old}/", f"/glossary/{new}/", "2-glossary-synonym",
            f"'{old}' -> '{new}'")

    # Tier 2 - glossary, exact slug match on both sites
    for slug in load("matched.txt"):
        add(f"/glossary/{slug}/", f"/glossary/{slug}/", "2-glossary-exact",
            "identical slug exists on MV3")

    # Tier 2c - glossary term that is really a service page
    for old, page in sorted(GLOSSARY_TO_PAGE.items()):
        add(f"/glossary/{old}/", page, "2-glossary-page",
            "term maps to a full MV3 service page")

    rows.sort(key=lambda r: (r[2], r[0]))
    return rows


def write_csv(rows):
    with open(os.path.join(HERE, "redirect-map.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["source", "target", "tier", "note"])
        for s, d, t, n in rows:
            w.writerow([SRC + s, DST + d, t, n])


def write_cloudflare(rows):
    """Cloudflare Bulk Redirects import format."""
    p = os.path.join(HERE, "cloudflare-bulk-redirects.csv")
    with open(p, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["source_url", "target_url", "status_code",
                    "include_subdomains", "subpath_matching",
                    "preserve_query_string", "preserve_path_suffix"])
        for s, d, _t, _n in rows:
            w.writerow([SRC + s, DST + d, 301, "true", "false", "true", "false"])


def write_nginx(rows):
    lines = [
        "# saasseo.com -> mv3marketing.com 301 map",
        "# Origin-level fallback. The Cloudflare rules are preferred because they",
        "# answer at the edge and do not need the WP Engine origin to be alive.",
        "",
        "map $request_uri $saasseo_redirect {",
        "    default \"\";",
        "",
    ]
    for s, d, _t, _n in rows:
        lines.append(f'    "{s}" "{DST}{d}";')
    lines += [
        "}",
        "",
        "server {",
        "    server_name saasseo.com www.saasseo.com;",
        "",
        "    if ($saasseo_redirect != \"\") {",
        "        return 301 $saasseo_redirect;",
        "    }",
        "",
        "    # Section fallbacks - keep users inside the matching MV3 hub",
        f'    location /glossary/   {{ return 301 {DST}/glossary/; }}',
        f'    location /case-study/ {{ return 301 {DST}/case-studies/; }}',
        f'    location /category/   {{ return 301 {DST}/blog/; }}',
        f'    location /author/     {{ return 301 {DST}/about/; }}',
        "",
        "    # Everything else is a retired blog post -> the blog hub, not the",
        "    # homepage, so Google does not treat the batch as soft 404s.",
        f"    return 301 {DST}/blog/;",
        "}",
    ]
    with open(os.path.join(HERE, "nginx-redirects.conf"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


def write_htaccess(rows):
    lines = [
        "# saasseo.com -> mv3marketing.com 301 map (Apache / WP Engine)",
        "RewriteEngine On",
        "",
    ]
    for s, d, _t, _n in rows:
        esc = s.replace(".", r"\.")
        lines.append(f"RewriteRule ^{esc.lstrip('/')}$ {DST}{d} [R=301,L]")
    lines += [
        "",
        "# Section fallbacks",
        f"RewriteRule ^glossary/   {DST}/glossary/   [R=301,L]",
        f"RewriteRule ^case-study/ {DST}/case-studies/ [R=301,L]",
        f"RewriteRule ^category/   {DST}/blog/       [R=301,L]",
        f"RewriteRule ^author/     {DST}/about/      [R=301,L]",
        "",
        "# Catch-all for retired blog posts",
        f"RewriteRule ^(.*)$ {DST}/blog/ [R=301,L]",
    ]
    with open(os.path.join(HERE, "htaccess-redirects.txt"), "w") as fh:
        fh.write("\n".join(lines) + "\n")



def write_cf_rules(rows):
    """
    Cloudflare Redirect Rules (Single Redirects) variant.

    Bulk Redirect list size is plan-limited, and 64 of the glossary redirects
    are identical-slug -> identical-slug, so one regex rule replaces all of
    them. Order matters: exceptions must run before the generic patterns.
    """
    page = [(s_, d) for s_, d, t, _ in rows if t == "1-page"]
    syn  = [(s_, d) for s_, d, t, _ in rows if t in ("2-glossary-synonym",
                                                     "2-glossary-page")]

    def eqexpr(paths):
        inner = " ".join(f'"{p}"' for p in paths)
        return f'http.request.uri.path in {{{inner}}}'

    out = []
    out.append("# Cloudflare Redirect Rules - saasseo.com -> mv3marketing.com")
    out.append("#")
    out.append("# Create these under: saasseo.com > Rules > Redirect Rules.")
    out.append("# Keep them in this exact order - rule 1 and 2 are exceptions")
    out.append("# that must evaluate before the generic patterns in 3 and 4.")
    out.append("# All rules: type = Dynamic, status = 301, preserve query string = on.")
    out.append("")

    out.append("## Rule 1 - money pages (exact path -> hand-mapped MV3 page)")
    out.append("When incoming requests match:")
    out.append("```")
    out.append(eqexpr([p for p, _ in page]))
    out.append("```")
    out.append("Then redirect to (expression):")
    out.append("```")
    out.append("# Use a Bulk Redirect list for this rule, or split into one")
    out.append("# static rule per path. The exact pairs are:")
    for p, d in sorted(page):
        out.append(f"#   {p:45s} -> {DST}{d}")
    out.append("```")
    out.append("")

    out.append("## Rule 2 - glossary terms whose slug changed on MV3")
    out.append("When incoming requests match:")
    out.append("```")
    out.append(eqexpr([p for p, _ in syn]))
    out.append("```")
    out.append("Exact pairs:")
    out.append("```")
    for p, d in sorted(syn):
        out.append(f"#   {p:52s} -> {DST}{d}")
    out.append("```")
    out.append("")

    out.append("## Rule 3 - glossary, identical slug (covers 64 URLs in one rule)")
    out.append("When incoming requests match:")
    out.append("```")
    out.append('starts_with(http.request.uri.path, "/glossary/")')
    out.append("```")
    out.append("Then, Dynamic redirect to:")
    out.append("```")
    out.append(f'concat("{DST}", http.request.uri.path)')
    out.append("```")
    out.append("Note: a slug MV3 does not have will 404. That is why rule 2")
    out.append("runs first, and why unmatched terms are listed in")
    out.append("glossary-unmatched.txt - review those before enabling rule 3,")
    out.append("or replace this rule with a static redirect to /glossary/.")
    out.append("")

    out.append("## Rule 4 - retired sections")
    out.append("```")
    out.append('starts_with(http.request.uri.path, "/case-study/")  '
               f'-> {DST}/case-studies/')
    out.append('starts_with(http.request.uri.path, "/category/")    '
               f'-> {DST}/blog/')
    out.append('starts_with(http.request.uri.path, "/author/")      '
               f'-> {DST}/about/')
    out.append('starts_with(http.request.uri.path, "/guide/")       '
               f'-> {DST}/resources/')
    out.append("```")
    out.append("")

    out.append("## Rule 5 - catch-all (must be LAST)")
    out.append("When incoming requests match:")
    out.append("```")
    out.append('http.host in {"saasseo.com" "www.saasseo.com"}')
    out.append("```")
    out.append("Then, Static redirect to:")
    out.append("```")
    out.append(f"{DST}/blog/")
    out.append("```")
    out.append("Everything left is a retired blog post. Sending them to the blog")
    out.append("hub rather than the homepage keeps the redirect topically")
    out.append("relevant, so Google is less likely to treat the batch as soft")
    out.append("404s and drop the signal entirely.")
    out.append("")

    with open(os.path.join(HERE, "cloudflare-redirect-rules.md"), "w") as fh:
        fh.write("\n".join(out) + "\n")

if __name__ == "__main__":
    rows = build()
    write_csv(rows)
    write_cloudflare(rows)
    write_nginx(rows)
    write_htaccess(rows)
    write_cf_rules(rows)
    from collections import Counter
    c = Counter(r[2] for r in rows)
    print(f"{len(rows)} redirects written")
    for k in sorted(c):
        print(f"  {k:22s} {c[k]}")
