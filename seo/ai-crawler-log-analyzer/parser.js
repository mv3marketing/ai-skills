/**
 * AI Crawler Log-File Behavior Analyzer: log parser.
 * Parses standard nginx/Apache "combined" log format lines into structured
 * entries. Zero dependencies, pure regex, no assumptions about log source
 * beyond the format itself (works with WP Engine, Cloudflare, nginx, Apache
 * exports, anything emitting combined format).
 */

const COMBINED_LOG_RE =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d{3}) (\S+) "([^"]*)" "([^"]*)"/;

/**
 * @param {string} line - one raw log line
 * @returns {object|null} parsed entry, or null if the line doesn't match combined format
 */
function parseLine(line) {
  const m = COMBINED_LOG_RE.exec(line);
  if (!m) return null;
  const [, ip, timeLocal, method, path, status, bytes, referer, userAgent] = m;
  return {
    ip,
    time: parseApacheTime(timeLocal),
    method,
    path: path.split('?')[0], // strip query string for URL-coverage comparisons
    status: parseInt(status, 10),
    bytes: bytes === '-' ? 0 : parseInt(bytes, 10),
    referer,
    userAgent,
  };
}

/**
 * Parses Apache/nginx's bracketed timestamp format: 10/Oct/2023:13:55:36 -0700
 * Returns a plain object instead of a Date to keep this module free of any
 * implicit-timezone Date() surprises. Callers that want a Date can build one.
 */
function parseApacheTime(timeLocal) {
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/.exec(timeLocal);
  if (!m) return null;
  const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const [, day, monAbbr, year, hour, minute, second, tz] = m;
  return {
    year: parseInt(year, 10),
    month: months[monAbbr],
    day: parseInt(day, 10),
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
    second: parseInt(second, 10),
    tz,
    dateKey: `${year}-${String(months[monAbbr]).padStart(2, '0')}-${day.padStart(2, '0')}`,
  };
}

/**
 * @param {string} logText - full log file contents (or a chunk), newline-separated
 * @returns {object[]} array of parsed entries; unparseable lines are silently skipped,
 *   with the skip count available via parseLog's second return value
 */
function parseLog(logText) {
  const lines = logText.split('\n').filter((l) => l.trim());
  const entries = [];
  let skipped = 0;
  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) entries.push(entry);
    else skipped++;
  }
  return { entries, skipped, totalLines: lines.length };
}

module.exports = { parseLine, parseApacheTime, parseLog };
