const assert = require('assert');
const { parseLine, parseLog } = require('./parser.js');
const { identifyBot, analyze } = require('./analyzer.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL - ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

function line(path, status, ua, date = '10/Aug/2026:12:00:00 -0700') {
  return `203.0.113.5 - - [${date}] "GET ${path} HTTP/1.1" ${status} 4096 "-" "${ua}"`;
}

const GPTBOT_UA = 'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)';
const CLAUDEBOT_UA = 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://anthropic.com/claudebot)';
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0';

console.log('AI Crawler Log-File Behavior Analyzer: test.js\n');

test('1. parses a well-formed combined-log line', () => {
  const entry = parseLine(line('/blog/post-1/', 200, GPTBOT_UA));
  assert.strictEqual(entry.path, '/blog/post-1/');
  assert.strictEqual(entry.status, 200);
  assert.strictEqual(entry.userAgent, GPTBOT_UA);
});

test('2. strips query strings from the path for coverage comparisons', () => {
  const entry = parseLine(line('/pricing/?utm_source=x', 200, GPTBOT_UA));
  assert.strictEqual(entry.path, '/pricing/');
});

test('3. returns null for a malformed line instead of throwing', () => {
  assert.strictEqual(parseLine('not a log line at all'), null);
});

test('4. parseLog counts skipped unparseable lines separately', () => {
  const { entries, skipped, totalLines } = parseLog(
    line('/a/', 200, GPTBOT_UA) + '\ngarbage line\n' + line('/b/', 200, GPTBOT_UA)
  );
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(skipped, 1);
  assert.strictEqual(totalLines, 3);
});

test('5. identifyBot matches known AI crawlers by UA substring', () => {
  assert.strictEqual(identifyBot(GPTBOT_UA), 'GPTBot');
  assert.strictEqual(identifyBot(CLAUDEBOT_UA), 'ClaudeBot');
});

test('6. identifyBot returns null for regular human/browser traffic', () => {
  assert.strictEqual(identifyBot(HUMAN_UA), null);
});

test('7. analyze() ignores non-AI-crawler traffic entirely', () => {
  const { entries } = parseLog(line('/a/', 200, HUMAN_UA));
  const report = analyze(entries);
  assert.deepStrictEqual(report, {});
});

test('8. analyze() computes coverage against a supplied site URL list', () => {
  const logText = [line('/a/', 200, GPTBOT_UA), line('/b/', 200, GPTBOT_UA)].join('\n');
  const { entries } = parseLog(logText);
  const report = analyze(entries, ['/a/', '/b/', '/c/', '/d/']);
  assert.strictEqual(report.GPTBot.coverage.site_urls_total, 4);
  assert.strictEqual(report.GPTBot.coverage.site_urls_crawled, 2);
  assert.strictEqual(report.GPTBot.coverage.coverage_pct, 50);
  assert.deepStrictEqual(report.GPTBot.coverage.never_crawled.sort(), ['/c/', '/d/']); // original strings, not normalized
});

test('9. flags a high error rate when >20% of a bot\'s hits are 4xx/5xx', () => {
  const lines = [];
  for (let i = 0; i < 10; i++) lines.push(line(`/ok-${i}/`, 200, GPTBOT_UA));
  for (let i = 0; i < 5; i++) lines.push(line(`/broken-${i}/`, 404, GPTBOT_UA));
  const { entries } = parseLog(lines.join('\n'));
  const report = analyze(entries);
  assert.ok(report.GPTBot.flags.some((f) => f.includes('High error rate')));
  assert.strictEqual(report.GPTBot.error_rate_pct, 33.3);
});

test('10. does NOT flag error rate when it is under the 20% threshold', () => {
  const lines = [];
  for (let i = 0; i < 19; i++) lines.push(line(`/ok-${i}/`, 200, GPTBOT_UA));
  lines.push(line('/broken/', 404, GPTBOT_UA));
  const { entries } = parseLog(lines.join('\n'));
  const report = analyze(entries);
  assert.ok(!report.GPTBot.flags.some((f) => f.includes('High error rate')));
});

test('11. detects a dropping crawl-frequency trend across the date range', () => {
  const lines = [];
  // First half: heavy crawling (days 1-4). Second half: much lighter (days 5-8).
  for (let d = 1; d <= 4; d++) {
    for (let i = 0; i < 10; i++) lines.push(line(`/p${d}-${i}/`, 200, GPTBOT_UA, `0${d}/Aug/2026:12:00:00 -0700`));
  }
  for (let d = 5; d <= 8; d++) {
    lines.push(line(`/p${d}/`, 200, GPTBOT_UA, `0${d}/Aug/2026:12:00:00 -0700`));
  }
  const { entries } = parseLog(lines.join('\n'));
  const report = analyze(entries);
  assert.strictEqual(report.GPTBot.crawl_trend.direction, 'dropping');
  assert.ok(report.GPTBot.flags.some((f) => f.includes('Crawl frequency dropped')));
});

test('12. reports insufficient_data for a trend when the date range is too short', () => {
  const { entries } = parseLog(line('/a/', 200, GPTBOT_UA));
  const report = analyze(entries);
  assert.strictEqual(report.GPTBot.crawl_trend.direction, 'insufficient_data');
});

test('13. tracks multiple distinct bots independently in the same log', () => {
  const logText = [
    line('/a/', 200, GPTBOT_UA),
    line('/a/', 200, CLAUDEBOT_UA),
    line('/b/', 200, CLAUDEBOT_UA),
  ].join('\n');
  const { entries } = parseLog(logText);
  const report = analyze(entries);
  assert.strictEqual(report.GPTBot.total_hits, 1);
  assert.strictEqual(report.ClaudeBot.total_hits, 2);
});

console.log(`\n${passed}/${passed + failed} passing`);
if (failed > 0) process.exit(1);
