'use strict';
const assert = require('assert');
const { convertTimingUnit, validateStepReferences, translateCadence, MINUTES_PER_UNIT } = require('./translator.js');

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

// --- convertTimingUnit ---
test('converts days to hours correctly', () => {
  assert.strictEqual(convertTimingUnit(1, 'days', 'hours'), 24);
});

test('converts minutes to hours correctly', () => {
  assert.strictEqual(convertTimingUnit(60, 'minutes', 'hours'), 1);
});

test('same-unit conversion is a no-op', () => {
  assert.strictEqual(convertTimingUnit(5, 'days', 'days'), 5);
});

test('business_days converts to a larger calendar-day figure (weekends averaged in)', () => {
  // 1 business day = 60*24*(7/5) minutes = 2016 minutes = 1.4 calendar days
  const result = convertTimingUnit(1, 'business_days', 'days');
  assert.strictEqual(result, 1.4);
});

test('throws on negative value', () => {
  assert.throws(() => convertTimingUnit(-1, 'days', 'hours'));
});

test('throws on unknown source unit', () => {
  assert.throws(() => convertTimingUnit(1, 'fortnights', 'hours'));
});

test('throws on unknown target unit', () => {
  assert.throws(() => convertTimingUnit(1, 'days', 'fortnights'));
});

test('MINUTES_PER_UNIT covers all four supported units', () => {
  assert.deepStrictEqual(Object.keys(MINUTES_PER_UNIT).sort(), ['business_days', 'days', 'hours', 'minutes']);
});

// --- validateStepReferences ---
test('a clean sequential sequence has no broken refs, no unreachable steps, no cycles', () => {
  const steps = [
    { id: 's1', delay: { value: 0, unit: 'days' } },
    { id: 's2', delay: { value: 1, unit: 'days' } },
    { id: 's3', delay: { value: 2, unit: 'days' } },
  ];
  const result = validateStepReferences(steps);
  assert.strictEqual(result.brokenReferences.length, 0);
  assert.strictEqual(result.unreachableStepIds.length, 0);
  assert.strictEqual(result.cycles.length, 0);
});

test('detects a broken branch reference to a nonexistent step id', () => {
  const steps = [
    { id: 's1', delay: { value: 0, unit: 'days' }, branches: { replied: 's99' } },
    { id: 's2', delay: { value: 1, unit: 'days' } },
  ];
  const result = validateStepReferences(steps);
  assert.strictEqual(result.brokenReferences.length, 1);
  assert.strictEqual(result.brokenReferences[0].target, 's99');
});

test('the reserved "exit" terminal id is never flagged as a broken reference', () => {
  const steps = [
    { id: 's1', delay: { value: 0, unit: 'days' }, branches: { bounced: 'exit' } },
    { id: 's2', delay: { value: 1, unit: 'days' } },
  ];
  const result = validateStepReferences(steps);
  assert.strictEqual(result.brokenReferences.length, 0);
});

test('detects a step unreachable from the entry step', () => {
  const steps = [
    { id: 's1', delay: { value: 0, unit: 'days' }, next: 'exit' },
    { id: 'orphan', delay: { value: 1, unit: 'days' } },
  ];
  const result = validateStepReferences(steps);
  assert.deepStrictEqual(result.unreachableStepIds, ['orphan']);
});

test('detects a real branch cycle', () => {
  const steps = [
    { id: 's1', delay: { value: 0, unit: 'days' }, next: 's2' },
    { id: 's2', delay: { value: 1, unit: 'days' }, branches: { noReply: 's1' } },
  ];
  const result = validateStepReferences(steps);
  assert.ok(result.cycles.length >= 1);
});

test('throws on duplicate step ids', () => {
  const steps = [
    { id: 's1', delay: { value: 0, unit: 'days' } },
    { id: 's1', delay: { value: 1, unit: 'days' } },
  ];
  assert.throws(() => validateStepReferences(steps));
});

test('throws on empty steps array', () => {
  assert.throws(() => validateStepReferences([]));
});

// --- translateCadence ---
test('converts step timing to the target unit', () => {
  const source = { steps: [{ id: 's1', delay: { value: 2, unit: 'days' }, action: 'email' }] };
  const result = translateCadence(source, { targetTimingUnit: 'hours' });
  assert.strictEqual(result.steps[0].delay.value, 48);
  assert.strictEqual(result.steps[0].delay.unit, 'hours');
});

test('applies fieldMap renames to custom fields, leaving id/delay/next/branches structurally intact', () => {
  const source = {
    steps: [{ id: 's1', delay: { value: 1, unit: 'days' }, subject: 'Hi there', body: 'Body text' }],
  };
  const result = translateCadence(source, {
    targetTimingUnit: 'days',
    fieldMap: { subject: 'emailSubject', body: 'emailBody' },
  });
  assert.strictEqual(result.steps[0].emailSubject, 'Hi there');
  assert.strictEqual(result.steps[0].emailBody, 'Body text');
  assert.strictEqual(result.steps[0].subject, undefined);
});

test('applies typeMap to the action field', () => {
  const source = { steps: [{ id: 's1', delay: { value: 1, unit: 'days' }, action: 'linkedin' }] };
  const result = translateCadence(source, {
    targetTimingUnit: 'days',
    typeMap: { linkedin: 'SocialTask' },
  });
  assert.strictEqual(result.steps[0].action, 'SocialTask');
});

test('an action value with no typeMap entry passes through unchanged', () => {
  const source = { steps: [{ id: 's1', delay: { value: 1, unit: 'days' }, action: 'call' }] };
  const result = translateCadence(source, { targetTimingUnit: 'days', typeMap: { email: 'AutoEmail' } });
  assert.strictEqual(result.steps[0].action, 'call');
});

test('preserves next and branches with their original step ids', () => {
  const source = {
    steps: [
      { id: 's1', delay: { value: 0, unit: 'days' }, next: 's2', branches: { replied: 'exit' } },
      { id: 's2', delay: { value: 1, unit: 'days' } },
    ],
  };
  const result = translateCadence(source, { targetTimingUnit: 'hours' });
  assert.strictEqual(result.steps[0].next, 's2');
  assert.strictEqual(result.steps[0].branches.replied, 'exit');
});

test('non-strict mode returns validation warnings instead of throwing on a broken reference', () => {
  const source = {
    steps: [{ id: 's1', delay: { value: 1, unit: 'days' }, branches: { replied: 'ghost' } }],
  };
  const result = translateCadence(source, { targetTimingUnit: 'days' });
  assert.strictEqual(result.validation.brokenReferences.length, 1);
  assert.strictEqual(result.steps.length, 1);
});

test('strict mode throws on a broken reference instead of shipping it silently', () => {
  const source = {
    steps: [{ id: 's1', delay: { value: 1, unit: 'days' }, branches: { replied: 'ghost' } }],
  };
  assert.throws(() => translateCadence(source, { targetTimingUnit: 'days' }, { strict: true }));
});

test('strict mode throws on a cycle', () => {
  const source = {
    steps: [
      { id: 's1', delay: { value: 0, unit: 'days' }, next: 's2' },
      { id: 's2', delay: { value: 1, unit: 'days' }, branches: { noReply: 's1' } },
    ],
  };
  assert.throws(() => translateCadence(source, { targetTimingUnit: 'days' }, { strict: true }));
});

test('throws when fieldMapping.targetTimingUnit is missing', () => {
  const source = { steps: [{ id: 's1', delay: { value: 1, unit: 'days' } }] };
  assert.throws(() => translateCadence(source, {}));
});

test('throws when a step is missing a valid delay', () => {
  const source = { steps: [{ id: 's1' }] };
  assert.throws(() => translateCadence(source, { targetTimingUnit: 'days' }));
});

test('sourceStepCount reflects the original step count', () => {
  const source = {
    steps: [
      { id: 's1', delay: { value: 0, unit: 'days' } },
      { id: 's2', delay: { value: 1, unit: 'days' } },
    ],
  };
  const result = translateCadence(source, { targetTimingUnit: 'hours' });
  assert.strictEqual(result.sourceStepCount, 2);
});

console.log(`\n${passed}/26 passing`);
