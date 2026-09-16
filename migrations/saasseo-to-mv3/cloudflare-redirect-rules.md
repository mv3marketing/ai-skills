# Cloudflare Redirect Rules - saasseo.com -> mv3marketing.com
#
# Create these under: saasseo.com > Rules > Redirect Rules.
# Keep them in this exact order - rule 1 and 2 are exceptions
# that must evaluate before the generic patterns in 3 and 4.
# All rules: type = Dynamic, status = 301, preserve query string = on.

## Rule 1 - money pages (exact path -> hand-mapped MV3 page)
When incoming requests match:
```
http.request.uri.path in {"/" "/abm-advertising-agency/" "/abm/" "/about-us/" "/accessibility/" "/ai-automation-articles/" "/ai-automation/" "/audio-advertising/" "/audit-seo-saas/" "/blog/" "/book/" "/case-studies/" "/case-study-results/" "/case-study/" "/clients/" "/contact-us/" "/contact/" "/content-marketing/" "/cookie-policy/" "/digital-ooh-advertising/" "/digital-pr-agency/" "/digital-pr-articles/" "/digital-pr/" "/display-advertising/" "/do-not-sell-my-information/" "/geo-audit/" "/geo-optimization-for-saas/" "/glossary/" "/guide/" "/holiday-marketing/" "/in-game-advertising/" "/native-advertising/" "/news/" "/optimized-website-architecture/" "/paid-advertising/" "/partners/" "/pricing/" "/privacy-policy/" "/results/" "/saas-abm-marketing/" "/saas-content-marketing-strategy/" "/saas-content/" "/saas-growth/" "/saas-keyword-research/" "/saas-link-building-agency/" "/saas-linkbuilding-agency-why-you-need-one-now/" "/saas-marketing-plan/" "/saas-marketing-tools/" "/saas-organic-growth-ai-powered-seo/" "/saas-ppc-agency/" "/saas-ppc/" "/saas-seo-agency/" "/saas-seo-consultant/" "/saas-seo-guide/" "/saas-seo-strategy/" "/saas-seo-tools/" "/saas-seo/" "/saas-technical-seo/" "/saas-website-migration/" "/schedule-demo/" "/seo-consultancy/" "/seo-geo/" "/seo-management-services/" "/seo/" "/services/"}
```
Then redirect to (expression):
```
# Use a Bulk Redirect list for this rule, or split into one
# static rule per path. The exact pairs are:
#   /                                             -> https://www.mv3marketing.com/
#   /abm-advertising-agency/                      -> https://www.mv3marketing.com/abm-agency/
#   /abm/                                         -> https://www.mv3marketing.com/abm-agency/
#   /about-us/                                    -> https://www.mv3marketing.com/about/
#   /accessibility/                               -> https://www.mv3marketing.com/
#   /ai-automation-articles/                      -> https://www.mv3marketing.com/ai-automation/
#   /ai-automation/                               -> https://www.mv3marketing.com/ai-automation/
#   /audio-advertising/                           -> https://www.mv3marketing.com/services/paid-media/
#   /audit-seo-saas/                              -> https://www.mv3marketing.com/technical-seo-audit/
#   /blog/                                        -> https://www.mv3marketing.com/blog/
#   /book/                                        -> https://www.mv3marketing.com/book/
#   /case-studies/                                -> https://www.mv3marketing.com/case-studies/
#   /case-study-results/                          -> https://www.mv3marketing.com/case-studies/
#   /case-study/                                  -> https://www.mv3marketing.com/case-studies/
#   /clients/                                     -> https://www.mv3marketing.com/case-studies/
#   /contact-us/                                  -> https://www.mv3marketing.com/contact-us/
#   /contact/                                     -> https://www.mv3marketing.com/contact-us/
#   /content-marketing/                           -> https://www.mv3marketing.com/content-marketing/
#   /cookie-policy/                               -> https://www.mv3marketing.com/
#   /digital-ooh-advertising/                     -> https://www.mv3marketing.com/services/paid-media/
#   /digital-pr-agency/                           -> https://www.mv3marketing.com/digital-pr/
#   /digital-pr-articles/                         -> https://www.mv3marketing.com/digital-pr/
#   /digital-pr/                                  -> https://www.mv3marketing.com/digital-pr/
#   /display-advertising/                         -> https://www.mv3marketing.com/services/paid-media/
#   /do-not-sell-my-information/                  -> https://www.mv3marketing.com/
#   /geo-audit/                                   -> https://www.mv3marketing.com/geo-audit/
#   /geo-optimization-for-saas/                   -> https://www.mv3marketing.com/services/seo/aeo/
#   /glossary/                                    -> https://www.mv3marketing.com/glossary/
#   /guide/                                       -> https://www.mv3marketing.com/resources/
#   /holiday-marketing/                           -> https://www.mv3marketing.com/services/paid-media/
#   /in-game-advertising/                         -> https://www.mv3marketing.com/services/paid-media/
#   /native-advertising/                          -> https://www.mv3marketing.com/services/paid-media/
#   /news/                                        -> https://www.mv3marketing.com/blog/
#   /optimized-website-architecture/              -> https://www.mv3marketing.com/technical-seo/
#   /paid-advertising/                            -> https://www.mv3marketing.com/services/paid-media/
#   /partners/                                    -> https://www.mv3marketing.com/agency-partnership/
#   /pricing/                                     -> https://www.mv3marketing.com/pricing/
#   /privacy-policy/                              -> https://www.mv3marketing.com/
#   /results/                                     -> https://www.mv3marketing.com/results/
#   /saas-abm-marketing/                          -> https://www.mv3marketing.com/abm-agency/
#   /saas-content-marketing-strategy/             -> https://www.mv3marketing.com/content-marketing/
#   /saas-content/                                -> https://www.mv3marketing.com/content-marketing/
#   /saas-growth/                                 -> https://www.mv3marketing.com/services/
#   /saas-keyword-research/                       -> https://www.mv3marketing.com/services/seo/
#   /saas-link-building-agency/                   -> https://www.mv3marketing.com/digital-pr/
#   /saas-linkbuilding-agency-why-you-need-one-now/ -> https://www.mv3marketing.com/digital-pr/
#   /saas-marketing-plan/                         -> https://www.mv3marketing.com/services/
#   /saas-marketing-tools/                        -> https://www.mv3marketing.com/blog/
#   /saas-organic-growth-ai-powered-seo/          -> https://www.mv3marketing.com/ai-seo-agency/
#   /saas-ppc-agency/                             -> https://www.mv3marketing.com/ppc-management/
#   /saas-ppc/                                    -> https://www.mv3marketing.com/ppc-management/
#   /saas-seo-agency/                             -> https://www.mv3marketing.com/ai-seo-agency/
#   /saas-seo-consultant/                         -> https://www.mv3marketing.com/ai-seo-agency/
#   /saas-seo-guide/                              -> https://www.mv3marketing.com/services/seo/
#   /saas-seo-strategy/                           -> https://www.mv3marketing.com/services/seo/
#   /saas-seo-tools/                              -> https://www.mv3marketing.com/blog/
#   /saas-seo/                                    -> https://www.mv3marketing.com/ai-seo-agency/
#   /saas-technical-seo/                          -> https://www.mv3marketing.com/technical-seo/
#   /saas-website-migration/                      -> https://www.mv3marketing.com/site-migrations/
#   /schedule-demo/                               -> https://www.mv3marketing.com/book/
#   /seo-consultancy/                             -> https://www.mv3marketing.com/ai-seo-agency/
#   /seo-geo/                                     -> https://www.mv3marketing.com/services/seo/aeo/
#   /seo-management-services/                     -> https://www.mv3marketing.com/seo-services/
#   /seo/                                         -> https://www.mv3marketing.com/services/seo/
#   /services/                                    -> https://www.mv3marketing.com/services/
```

## Rule 2 - glossary terms whose slug changed on MV3
When incoming requests match:
```
http.request.uri.path in {"/glossary/programmatic-seo/" "/glossary/technical-seo-audit/" "/glossary/abm/" "/glossary/account-based-advertising/" "/glossary/ai-citation/" "/glossary/ai-content-generation/" "/glossary/alt-text/" "/glossary/broad-match/" "/glossary/cac-payback-period/" "/glossary/canonical-tag/" "/glossary/churn-prediction/" "/glossary/competitive-backlink-analysis/" "/glossary/competitor-analysis-seo/" "/glossary/cost-per-acquisition-cpa/" "/glossary/cost-per-click-cpc/" "/glossary/cost-per-lead-cpl/" "/glossary/crawl-depth/" "/glossary/customer-journey-abm/" "/glossary/customer-match-ads/" "/glossary/display-retargeting/" "/glossary/ecpc-enhanced-cpc/" "/glossary/geo-generative-engine-optimization/" "/glossary/google-algorithm-updates/" "/glossary/gsc-google-search-console/" "/glossary/helpful-content/" "/glossary/icp/" "/glossary/ideal-customer-profile/" "/glossary/in-market-accounts/" "/glossary/indexability/" "/glossary/nrr/" "/glossary/pay-per-click/" "/glossary/press-release/" "/glossary/quality-score-improvement/" "/glossary/rag-retrieval-augmented-generation/" "/glossary/retargeting-window/" "/glossary/return-on-ad-spend/" "/glossary/sales-cycle-abm/" "/glossary/tam-total-addressable-market/"}
```
Exact pairs:
```
#   /glossary/abm/                                       -> https://www.mv3marketing.com/glossary/account-based-marketing/
#   /glossary/account-based-advertising/                 -> https://www.mv3marketing.com/glossary/account-based-marketing/
#   /glossary/ai-citation/                               -> https://www.mv3marketing.com/glossary/ai-citation-optimization/
#   /glossary/ai-content-generation/                     -> https://www.mv3marketing.com/glossary/ai-content/
#   /glossary/alt-text/                                  -> https://www.mv3marketing.com/glossary/alt-text-seo/
#   /glossary/broad-match/                               -> https://www.mv3marketing.com/glossary/broad-match-keyword/
#   /glossary/cac-payback-period/                        -> https://www.mv3marketing.com/glossary/payback-period/
#   /glossary/canonical-tag/                             -> https://www.mv3marketing.com/glossary/canonical/
#   /glossary/churn-prediction/                          -> https://www.mv3marketing.com/glossary/churn-prevention/
#   /glossary/competitive-backlink-analysis/             -> https://www.mv3marketing.com/glossary/competitive-analysis/
#   /glossary/competitor-analysis-seo/                   -> https://www.mv3marketing.com/glossary/competitor-seo-analysis/
#   /glossary/cost-per-acquisition-cpa/                  -> https://www.mv3marketing.com/glossary/cost-per-acquisition/
#   /glossary/cost-per-click-cpc/                        -> https://www.mv3marketing.com/glossary/cost-per-click/
#   /glossary/cost-per-lead-cpl/                         -> https://www.mv3marketing.com/glossary/cost-per-lead/
#   /glossary/crawl-depth/                               -> https://www.mv3marketing.com/glossary/crawl-budget/
#   /glossary/customer-journey-abm/                      -> https://www.mv3marketing.com/glossary/customer-journey/
#   /glossary/customer-match-ads/                        -> https://www.mv3marketing.com/glossary/customer-match/
#   /glossary/display-retargeting/                       -> https://www.mv3marketing.com/glossary/retargeting/
#   /glossary/ecpc-enhanced-cpc/                         -> https://www.mv3marketing.com/glossary/enhanced-cpc/
#   /glossary/geo-generative-engine-optimization/        -> https://www.mv3marketing.com/glossary/geo/
#   /glossary/google-algorithm-updates/                  -> https://www.mv3marketing.com/glossary/google-algorithm-update/
#   /glossary/gsc-google-search-console/                 -> https://www.mv3marketing.com/glossary/google-search-console/
#   /glossary/helpful-content/                           -> https://www.mv3marketing.com/glossary/helpful-content-update/
#   /glossary/icp/                                       -> https://www.mv3marketing.com/glossary/icp-ideal-customer-profile/
#   /glossary/ideal-customer-profile/                    -> https://www.mv3marketing.com/glossary/icp-ideal-customer-profile/
#   /glossary/in-market-accounts/                        -> https://www.mv3marketing.com/glossary/in-market-audiences/
#   /glossary/indexability/                              -> https://www.mv3marketing.com/glossary/index-coverage/
#   /glossary/nrr/                                       -> https://www.mv3marketing.com/glossary/net-revenue-retention/
#   /glossary/pay-per-click/                             -> https://www.mv3marketing.com/glossary/ppc/
#   /glossary/press-release/                             -> https://www.mv3marketing.com/glossary/press-release-distribution/
#   /glossary/programmatic-seo/                          -> https://www.mv3marketing.com/programmatic-seo/
#   /glossary/quality-score-improvement/                 -> https://www.mv3marketing.com/glossary/quality-score/
#   /glossary/rag-retrieval-augmented-generation/        -> https://www.mv3marketing.com/glossary/retrieval-augmented-generation/
#   /glossary/retargeting-window/                        -> https://www.mv3marketing.com/glossary/retargeting/
#   /glossary/return-on-ad-spend/                        -> https://www.mv3marketing.com/glossary/roas/
#   /glossary/sales-cycle-abm/                           -> https://www.mv3marketing.com/glossary/sales-cycle/
#   /glossary/tam-total-addressable-market/              -> https://www.mv3marketing.com/glossary/tam-sam-som/
#   /glossary/technical-seo-audit/                       -> https://www.mv3marketing.com/technical-seo-audit/
```

## Rule 3 - glossary, identical slug (covers 64 URLs in one rule)
When incoming requests match:
```
starts_with(http.request.uri.path, "/glossary/")
```
Then, Dynamic redirect to:
```
concat("https://www.mv3marketing.com", http.request.uri.path)
```
Note: a slug MV3 does not have will 404. That is why rule 2
runs first, and why unmatched terms are listed in
glossary-unmatched.txt - review those before enabling rule 3,
or replace this rule with a static redirect to /glossary/.

## Rule 4 - retired sections
```
starts_with(http.request.uri.path, "/case-study/")  -> https://www.mv3marketing.com/case-studies/
starts_with(http.request.uri.path, "/category/")    -> https://www.mv3marketing.com/blog/
starts_with(http.request.uri.path, "/author/")      -> https://www.mv3marketing.com/about/
starts_with(http.request.uri.path, "/guide/")       -> https://www.mv3marketing.com/resources/
```

## Rule 5 - catch-all (must be LAST)
When incoming requests match:
```
http.host in {"saasseo.com" "www.saasseo.com"}
```
Then, Static redirect to:
```
https://www.mv3marketing.com/blog/
```
Everything left is a retired blog post. Sending them to the blog
hub rather than the homepage keeps the redirect topically
relevant, so Google is less likely to treat the batch as soft
404s and drop the signal entirely.

