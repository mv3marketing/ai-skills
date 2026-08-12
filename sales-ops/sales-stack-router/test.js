const assert = require('assert');
const { route } = require('./router.js');

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

function baseManifests() {
  // Deep-clone-ish fresh copy per test so mutations in one test never leak into another.
  return JSON.parse(JSON.stringify([
    {
      server_id: 'outreach-prod-1', platform: 'Outreach.io', status: 'connected', priority: 0,
      capabilities: [
        { name: 'sequence.add', required_scope: 'write' },
        { name: 'contact.enrich', required_scope: 'read' },
        { name: 'prospect.delete', required_scope: 'destructive' },
      ],
      rate_limit: { window_seconds: 60, max_calls: 100 }, usage_this_window: 10,
    },
    {
      server_id: 'salesloft-prod-1', platform: 'Salesloft', status: 'connected', priority: 1,
      capabilities: [
        { name: 'sequence.add', required_scope: 'write' },
        { name: 'contact.enrich', required_scope: 'read' },
      ],
      rate_limit: { window_seconds: 60, max_calls: 200 }, usage_this_window: 12,
    },
    {
      server_id: 'apollo-degraded', platform: 'Apollo.io', status: 'degraded', priority: 2,
      capabilities: [{ name: 'contact.enrich', required_scope: 'read' }],
      rate_limit: { window_seconds: 60, max_calls: 50 }, usage_this_window: 5,
    },
  ]));
}

console.log('Sales Stack Router — test.js\n');

test('1. picks the lowest-priority connected server that has the capability', () => {
  const result = route({ capability: 'contact.enrich' }, baseManifests());
  assert.strictEqual(result.decision, 'route');
  assert.strictEqual(result.pick.server_id, 'outreach-prod-1');
});

test('2. falls back to next-priority server when top pick is rate-limited', () => {
  const manifests = baseManifests();
  manifests[0].usage_this_window = 100; // outreach at its own max_calls
  const result = route({ capability: 'contact.enrich' }, manifests);
  assert.strictEqual(result.decision, 'route');
  assert.strictEqual(result.pick.server_id, 'salesloft-prod-1');
});

test('3. degraded server is never picked even if it uniquely has the capability', () => {
  const manifests = baseManifests().filter((m) => m.server_id !== 'salesloft-prod-1');
  manifests[0].capabilities = []; // strip contact.enrich from outreach too
  const result = route({ capability: 'contact.enrich' }, manifests);
  assert.strictEqual(result.decision, 'no_capable_server');
});

test('4. destructive capability is blocked by default', () => {
  const result = route({ capability: 'prospect.delete' }, baseManifests());
  assert.strictEqual(result.decision, 'no_capable_server');
});

test('5. destructive capability is routed when explicitly allowed', () => {
  const result = route({ capability: 'prospect.delete', allow_destructive: true }, baseManifests());
  assert.strictEqual(result.decision, 'route');
  assert.strictEqual(result.pick.server_id, 'outreach-prod-1');
});

test('6. all capable servers at rate limit returns rate_limited with retry_after_seconds', () => {
  const manifests = baseManifests();
  manifests[0].usage_this_window = 100;
  manifests[1].usage_this_window = 200;
  const result = route({ capability: 'contact.enrich' }, manifests.filter((m) => m.server_id !== 'apollo-degraded'));
  assert.strictEqual(result.decision, 'rate_limited');
  assert.strictEqual(result.retry_after_seconds, 60);
});

test('7. unknown capability with no declaring server returns no_capable_server', () => {
  const result = route({ capability: 'invoice.void' }, baseManifests());
  assert.strictEqual(result.decision, 'no_capable_server');
});

test('8. equal priority ties break toward the server with more remaining capacity', () => {
  const manifests = baseManifests();
  manifests[0].priority = 1; // now outreach and salesloft tie at priority 1
  manifests[0].usage_this_window = 90; // outreach: 10 remaining
  manifests[1].usage_this_window = 5; // salesloft: 195 remaining
  const result = route({ capability: 'contact.enrich' }, manifests);
  assert.strictEqual(result.pick.server_id, 'salesloft-prod-1');
});

test('9. missing capability in request throws TypeError', () => {
  assert.throws(() => route({}, baseManifests()), TypeError);
});

test('10. non-array manifests throws TypeError', () => {
  assert.throws(() => route({ capability: 'contact.enrich' }, 'not-an-array'), TypeError);
});

test('11. server with no declared rate_limit is treated as unbounded', () => {
  const manifests = baseManifests();
  delete manifests[0].rate_limit;
  delete manifests[0].usage_this_window;
  const result = route({ capability: 'contact.enrich' }, manifests);
  assert.strictEqual(result.decision, 'route');
  assert.strictEqual(result.pick.server_id, 'outreach-prod-1');
});

test('12. fallback_chain lists remaining ranked candidates, not just the pick', () => {
  const result = route({ capability: 'contact.enrich' }, baseManifests());
  assert.strictEqual(result.fallback_chain.length, 1);
  assert.strictEqual(result.fallback_chain[0].server_id, 'salesloft-prod-1');
});

console.log(`\n${passed}/${passed + failed} passing`);
if (failed > 0) process.exit(1);
