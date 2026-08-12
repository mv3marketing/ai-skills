/**
 * AI Crawler Log-File Behavior Analyzer: analysis engine.
 * Takes parsed log entries (from parser.js) and the known-bot list, and
 * computes real per-bot behavior: coverage against your actual site URL
 * list, status-code health, and crawl-frequency trend. This is the part no
 * existing "AI crawler checker" does. Those only read robots.txt rules.
 */

const knownBots = require('./known-bots.json').bots;

/**
 * Matches a User-Agent string against the known-bot list.
 * @returns {string|null} the bot's canonical name, or null if not a known AI crawler
 */
function identifyBot(userAgent) {
  if (!userAgent) return null;
  for (const bot of knownBots) {
    if (userAgent.includes(bot.ua_substring)) return bot.name;
  }
  return null;
}

/**
 * @param {object[]} entries - parsed log entries from parser.js
 * @param {string[]} [siteUrls] - optional: your full list of real site paths
 *   (e.g. from a sitemap export), used to compute crawl coverage. Paths should
 *   be normalized the same way parser.js normalizes them (query string stripped).
 * @returns {object} per-bot behavior report
 */
function analyze(entries, siteUrls) {
  const byBot = {};

  for (const entry of entries) {
    const botName = identifyBot(entry.userAgent);
    if (!botName) continue;
    if (!byBot[botName]) {
      byBot[botName] = { hits: 0, urls: new Set(), statusCounts: {}, hitsByDate: {} };
    }
    const b = byBot[botName];
    b.hits++;
    b.urls.add(entry.path);
    b.statusCounts[entry.status] = (b.statusCounts[entry.status] || 0) + 1;
    if (entry.time) {
      b.hitsByDate[entry.time.dateKey] = (b.hitsByDate[entry.time.dateKey] || 0) + 1;
    }
  }

  const report = {};

  for (const [botName, b] of Object.entries(byBot)) {
    const errorHits = Object.entries(b.statusCounts)
      .filter(([code]) => Number(code) >= 400)
      .reduce((sum, [, count]) => sum + count, 0);
    const errorRate = b.hits > 0 ? errorHits / b.hits : 0;

    const dates = Object.keys(b.hitsByDate).sort();
    const trend = computeTrend(dates, b.hitsByDate);

    let coverage = null;
    if (siteUrls) {
      // Compare normalized-to-normalized on both sides, but report never_crawled
      // using the caller's original URL strings so the output reads naturally.
      const crawledNormalized = new Set([...b.urls].map(normalizePath));
      const crawledFromSite = siteUrls.filter((u) => crawledNormalized.has(normalizePath(u)));
      const neverCrawled = siteUrls.filter((u) => !crawledNormalized.has(normalizePath(u)));
      coverage = {
        site_urls_total: siteUrls.length,
        site_urls_crawled: crawledFromSite.length,
        coverage_pct: siteUrls.length > 0 ? +(crawledFromSite.length / siteUrls.length * 100).toFixed(1) : null,
        never_crawled: neverCrawled,
      };
    }

    const flags = [];
    if (errorRate > 0.2) flags.push(`High error rate: ${(errorRate * 100).toFixed(1)}% of ${botName}'s hits returned 4xx/5xx.`);
    if (trend.direction === 'dropping') flags.push(`Crawl frequency dropped ${trend.pct_change}% (comparing first half to second half of the log's date range).`);
    if (coverage && coverage.coverage_pct !== null && coverage.coverage_pct < 50) {
      flags.push(`Low coverage: only ${coverage.coverage_pct}% of your listed site URLs were crawled by ${botName} in this log window.`);
    }

    report[botName] = {
      total_hits: b.hits,
      unique_urls_crawled: b.urls.size,
      status_code_breakdown: b.statusCounts,
      error_rate_pct: +(errorRate * 100).toFixed(1),
      date_range: dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null,
      crawl_trend: trend,
      coverage,
      flags,
    };
  }

  return report;
}

/**
 * Splits the date range into two halves and compares average daily hits,
 * to catch a real "this bot stopped visiting as often" signal, not just a
 * raw total that could look fine even while a bot's interest is declining.
 */
function computeTrend(sortedDateKeys, hitsByDate) {
  if (sortedDateKeys.length < 4) {
    return { direction: 'insufficient_data', pct_change: null };
  }
  const mid = Math.floor(sortedDateKeys.length / 2);
  const firstHalf = sortedDateKeys.slice(0, mid);
  const secondHalf = sortedDateKeys.slice(mid);
  const avg = (keys) => keys.reduce((sum, k) => sum + hitsByDate[k], 0) / keys.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  if (firstAvg === 0) return { direction: 'insufficient_data', pct_change: null };
  const pctChange = +((secondAvg - firstAvg) / firstAvg * 100).toFixed(1);
  let direction = 'stable';
  if (pctChange <= -25) direction = 'dropping';
  else if (pctChange >= 25) direction = 'rising';
  return { direction, pct_change: pctChange };
}

function normalizePath(p) {
  return p.split('?')[0].replace(/\/$/, '') || '/';
}

module.exports = { identifyBot, analyze };
