/**
 * Real automated test for the objection-tree router.
 * Run: node test.js
 */
const { routeObjection, tree } = require('./router.js');

let failures = 0, passed = 0;
function check(label, actual, expected) {
  if (actual !== expected) {
    console.error(`FAIL [${label}] expected "${expected}", got "${actual}"`);
    failures++;
  } else {
    console.log(`PASS [${label}] -> ${actual}`);
    passed++;
  }
}

// 1. Authority objection escalates immediately, first turn, no response attempt.
{
  const state = {};
  const r = routeObjection('authority.not_decision_maker', state);
  check('authority escalates immediately on turn 1', r.action, 'escalate');
}

// 2. Price objection: 1st and 2nd pushback get a response, 3rd escalates (max_price_pushback_rounds=2).
{
  const state = {};
  const r1 = routeObjection('price.discount_ask', state);
  const r2 = routeObjection('price.discount_ask', state);
  const r3 = routeObjection('price.discount_ask', state);
  check('price round 1 -> respond', r1.action, 'respond');
  check('price round 2 -> respond', r2.action, 'respond');
  check('price round 3 -> escalate', r3.action, 'escalate');
}

// 3. Timing objection with timeline under threshold -> respond, not escalate.
{
  const state = { timeline_days: 60 };
  const r = routeObjection('timing.wrong_quarter', state);
  check('timing 60 days (under 180 threshold) -> respond', r.action, 'respond');
}

// 4. Timing objection with timeline over threshold -> escalate.
{
  const state = { timeline_days: 240 };
  const r = routeObjection('timing.not_now', state);
  check('timing 240 days (over 180 threshold) -> escalate', r.action, 'escalate');
}

// 5. Unknown branch throws, doesn't silently no-op.
{
  let threw = false;
  try { routeObjection('price.made_up_branch', {}); } catch (e) { threw = true; }
  check('unknown branch throws', threw, true);
}

// 6. Config sanity: exactly 6 branches, 3 distinct escalation rule types, matching the published meta-strip (6 branches / 3 escalation rules).
{
  const branchCount = Object.keys(tree.branches).length;
  const ruleTypes = new Set();
  for (const b of Object.values(tree.branches)) {
    if (b.escalate_immediately) ruleTypes.add('immediate');
    if (b.escalate_if_timeline_days_gt !== undefined) ruleTypes.add('timeline');
    if (b.escalate_after_rounds !== undefined) ruleTypes.add('rounds');
  }
  check('branch count matches published spec (6)', branchCount, 6);
  check('distinct escalation rule types matches published spec (3)', ruleTypes.size, 3);
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
