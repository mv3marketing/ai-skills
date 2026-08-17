'use strict';
const assert = require('assert');
const { detectDuplicatePhotos, detectTitleDrift, detectThinBios, auditPersonaConsistency } = require('./auditor.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`FAIL: ${name} -> ${e.message}`);
    process.exitCode = 1;
  }
}

// --- detectDuplicatePhotos ---
test('throws on empty personas array', () => {
  assert.throws(() => detectDuplicatePhotos([]));
});

test('throws when a persona is missing photoHash', () => {
  assert.throws(() => detectDuplicatePhotos([{ personaId: 'a', name: 'A' }]));
});

test('flags two distinct personas sharing the same photo hash', () => {
  const personas = [
    { personaId: 'jordan', name: 'Jordan Reeves', photoHash: 'hash-abc' },
    { personaId: 'morgan', name: 'Morgan Ellis', photoHash: 'hash-abc' },
  ];
  const findings = detectDuplicatePhotos(personas);
  assert.strictEqual(findings.length, 1);
  assert.deepStrictEqual(findings[0].personaIds.sort(), ['jordan', 'morgan']);
});

test('does not flag unique photos per persona', () => {
  const personas = [
    { personaId: 'jordan', name: 'Jordan Reeves', photoHash: 'hash-abc' },
    { personaId: 'morgan', name: 'Morgan Ellis', photoHash: 'hash-def' },
  ];
  assert.strictEqual(detectDuplicatePhotos(personas).length, 0);
});

test('does not flag the same persona appearing multiple times with the same photo (not a real violation)', () => {
  const personas = [
    { personaId: 'jordan', name: 'Jordan Reeves', photoHash: 'hash-abc' },
    { personaId: 'jordan', name: 'Jordan Reeves', photoHash: 'hash-abc' },
  ];
  assert.strictEqual(detectDuplicatePhotos(personas).length, 0);
});

// --- detectTitleDrift ---
test('throws on empty pageRecords', () => {
  assert.throws(() => detectTitleDrift([]));
});

test('flags a persona with two different titles across pages', () => {
  const records = [
    { personaId: 'alex', name: 'Alex Carter', title: 'SEO & Content Strategy', pageUrl: '/blog/post-1' },
    { personaId: 'alex', name: 'Alex Carter', title: 'Head of SEO', pageUrl: '/blog/post-2' },
  ];
  const findings = detectTitleDrift(records);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].titlesFound.length, 2);
});

test('does not flag a persona with a consistent title across all pages', () => {
  const records = [
    { personaId: 'alex', name: 'Alex Carter', title: 'SEO & Content Strategy', pageUrl: '/blog/post-1' },
    { personaId: 'alex', name: 'Alex Carter', title: 'SEO & Content Strategy', pageUrl: '/blog/post-2' },
  ];
  assert.strictEqual(detectTitleDrift(records).length, 0);
});

test('handles multiple personas independently', () => {
  const records = [
    { personaId: 'alex', name: 'Alex Carter', title: 'SEO Lead', pageUrl: '/a' },
    { personaId: 'alex', name: 'Alex Carter', title: 'SEO Lead', pageUrl: '/b' },
    { personaId: 'jordan', name: 'Jordan Reeves', title: 'ABM Lead', pageUrl: '/c' },
    { personaId: 'jordan', name: 'Jordan Reeves', title: 'Outbound Lead', pageUrl: '/d' },
  ];
  const findings = detectTitleDrift(records);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].personaId, 'jordan');
});

// --- detectThinBios ---
test('throws on empty personas array for detectThinBios', () => {
  assert.throws(() => detectThinBios([]));
});

test('flags a bio under the minimum word count', () => {
  const personas = [{ personaId: 'x', name: 'X', bio: 'Short bio here.' }];
  const findings = detectThinBios(personas);
  assert.strictEqual(findings.length, 1);
});

test('does not flag a sufficiently long bio', () => {
  const personas = [{ personaId: 'x', name: 'X', bio: 'This is a real, substantive bio with plenty of words describing this persona\'s real background and role at the company in detail.' }];
  assert.strictEqual(detectThinBios(personas).length, 0);
});

test('treats a missing bio as zero words and flags it', () => {
  const personas = [{ personaId: 'x', name: 'X' }];
  const findings = detectThinBios(personas);
  assert.strictEqual(findings[0].wordCount, 0);
});

// --- auditPersonaConsistency (integration) ---
test('auditPersonaConsistency runs all three checks and combines results', () => {
  const personas = [
    { personaId: 'jordan', name: 'Jordan Reeves', photoHash: 'hash-1', bio: 'Short.' },
    { personaId: 'morgan', name: 'Morgan Ellis', photoHash: 'hash-1', bio: 'Also a real substantive bio with enough words to pass the minimum threshold check comfortably here.' },
  ];
  const pageRecords = [
    { personaId: 'jordan', name: 'Jordan Reeves', title: 'ABM Lead', pageUrl: '/a' },
    { personaId: 'jordan', name: 'Jordan Reeves', title: 'Outbound Lead', pageUrl: '/b' },
  ];
  const report = auditPersonaConsistency({ personas, pageRecords });
  assert.strictEqual(report.duplicatePhotos.length, 1);
  assert.strictEqual(report.titleDrift.length, 1);
  assert.strictEqual(report.thinBios.length, 1);
});

console.log(`\n${passed}/14 passing`);
