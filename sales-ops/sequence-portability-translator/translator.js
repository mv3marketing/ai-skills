/**
 * Sequence Portability Translator
 * MV3 Marketing — Sales Engagement skill
 *
 * Converts a cadence/sequence between outbound-tool schemas via a
 * declarative field-mapping table you supply — not hardcoded to any real
 * vendor's exact API field names, since those change and vary by API
 * version. Two real technical problems this actually solves:
 *
 *   1. Timing unit conversion — tools disagree on whether a step delay is
 *      minutes, hours, calendar days, or business days. A naive rename
 *      silently ships a step scheduled 5x too fast or too slow.
 *   2. Broken branch references — a step's conditional branch (e.g. "on
 *      reply, jump to step 7") pointing at a step id that doesn't exist,
 *      or a branch cycle that would loop the sequence forever, is a real
 *      bug that's easy to introduce by hand-editing and easy to miss by
 *      eye. This validates the step graph with real reachability (BFS)
 *      and cycle detection (DFS) before translation ships.
 */

'use strict';

const RESERVED_TERMINAL_IDS = new Set(['exit']);

const MINUTES_PER_UNIT = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
  // Business-day conversion is necessarily approximate: it averages
  // weekends out over a 7-day week rather than simulating a real calendar,
  // since a true conversion requires an actual start date. Documented, not
  // hidden, so callers know the precision tradeoff.
  business_days: 60 * 24 * (7 / 5),
};

/**
 * @param {number} value
 * @param {string} fromUnit
 * @param {string} toUnit
 * @returns {number}
 */
function convertTimingUnit(value, fromUnit, toUnit) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) {
    throw new Error('value must be a non-negative finite number.');
  }
  if (!Object.prototype.hasOwnProperty.call(MINUTES_PER_UNIT, fromUnit)) {
    throw new Error(`Unknown source timing unit: ${fromUnit}`);
  }
  if (!Object.prototype.hasOwnProperty.call(MINUTES_PER_UNIT, toUnit)) {
    throw new Error(`Unknown target timing unit: ${toUnit}`);
  }
  const totalMinutes = value * MINUTES_PER_UNIT[fromUnit];
  return totalMinutes / MINUTES_PER_UNIT[toUnit];
}

/**
 * Builds the directed step graph: each step's outgoing edges are its
 * explicit `next` (if set) or `branches` targets, plus an implicit
 * sequential edge to the next array element when neither is set and it
 * isn't the last step.
 * @param {Array<Object>} steps
 * @returns {Map<string, string[]>}
 */
function buildStepGraph(steps) {
  const idToIndex = new Map(steps.map((s, i) => [s.id, i]));
  const graph = new Map();

  steps.forEach((step, i) => {
    const edges = [];
    if (step.next) {
      edges.push(step.next);
    } else if (i < steps.length - 1) {
      edges.push(steps[i + 1].id);
    }
    if (step.branches && typeof step.branches === 'object') {
      for (const target of Object.values(step.branches)) {
        edges.push(target);
      }
    }
    graph.set(step.id, edges);
  });

  return { graph, idToIndex };
}

/**
 * Validates a step graph for broken references, unreachable steps, and
 * cycles. Does not mutate or throw by default — callers decide how to
 * react (see translateCadence's `strict` option).
 * @param {Array<Object>} steps
 * @returns {{brokenReferences: Array<{stepId: string, target: string}>, unreachableStepIds: string[], cycles: Array<string[]>}}
 */
function validateStepReferences(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('steps must be a non-empty array.');
  }
  const ids = new Set();
  for (const step of steps) {
    if (!step || typeof step.id !== 'string' || !step.id) {
      throw new Error('Every step must have a non-empty string id.');
    }
    if (ids.has(step.id)) throw new Error(`Duplicate step id: ${step.id}`);
    ids.add(step.id);
  }

  const { graph } = buildStepGraph(steps);

  // Broken references: any edge target that isn't a real step id or a
  // reserved terminal (e.g. 'exit').
  const brokenReferences = [];
  for (const step of steps) {
    const edges = graph.get(step.id);
    for (const target of edges) {
      if (!ids.has(target) && !RESERVED_TERMINAL_IDS.has(target)) {
        brokenReferences.push({ stepId: step.id, target });
      }
    }
  }

  // Reachability via BFS from the first step.
  const reachable = new Set();
  const queue = [steps[0].id];
  reachable.add(steps[0].id);
  while (queue.length > 0) {
    const current = queue.shift();
    const edges = graph.get(current) || [];
    for (const target of edges) {
      if (ids.has(target) && !reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  const unreachableStepIds = steps.map((s) => s.id).filter((id) => !reachable.has(id));

  // Cycle detection via DFS with a recursion stack. Broken references are
  // skipped here (already reported above) so they don't produce spurious
  // "cycle" noise.
  const cycles = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(steps.map((s) => [s.id, WHITE]));
  const stack = [];

  function dfs(nodeId) {
    color.set(nodeId, GRAY);
    stack.push(nodeId);
    const edges = (graph.get(nodeId) || []).filter((t) => ids.has(t));
    for (const target of edges) {
      if (color.get(target) === GRAY) {
        const cycleStart = stack.indexOf(target);
        cycles.push(stack.slice(cycleStart).concat(target));
      } else if (color.get(target) === WHITE) {
        dfs(target);
      }
    }
    stack.pop();
    color.set(nodeId, BLACK);
  }
  for (const step of steps) {
    if (color.get(step.id) === WHITE) dfs(step.id);
  }

  return { brokenReferences, unreachableStepIds, cycles };
}

/**
 * Translates a source cadence into a target schema using a declarative
 * field-mapping table.
 *
 * @param {Object} sourceSequence - { steps: [{ id, delay: {value, unit}, next?, branches?, ...customFields }] }
 * @param {Object} fieldMapping
 * @param {string} fieldMapping.targetTimingUnit - one of 'minutes'|'hours'|'days'|'business_days'
 * @param {Object} [fieldMapping.fieldMap] - source field name -> target field name, applied to every step's custom (non-id/delay/next/branches) fields
 * @param {Object} [fieldMapping.typeMap] - optional value translation table applied to a step's `action` field, e.g. { email: 'AutoEmail' }
 * @param {Object} [opts]
 * @param {boolean} [opts.strict=false] - if true, throws when validation finds broken references or cycles instead of returning them as warnings
 * @returns {{steps: Array<Object>, validation: Object, sourceStepCount: number, targetTimingUnit: string}}
 */
function translateCadence(sourceSequence, fieldMapping, opts = {}) {
  if (!sourceSequence || !Array.isArray(sourceSequence.steps)) {
    throw new Error('sourceSequence.steps must be an array.');
  }
  if (!fieldMapping || typeof fieldMapping.targetTimingUnit !== 'string') {
    throw new Error('fieldMapping.targetTimingUnit is required.');
  }
  const { strict = false } = opts;
  const { fieldMap = {}, typeMap = {}, targetTimingUnit } = fieldMapping;
  const steps = sourceSequence.steps;

  const validation = validateStepReferences(steps);
  if (strict && (validation.brokenReferences.length > 0 || validation.cycles.length > 0)) {
    throw new Error(
      `Cadence failed strict validation: ${validation.brokenReferences.length} broken reference(s), ${validation.cycles.length} cycle(s). Fix the source sequence or pass { strict: false } to translate anyway with warnings.`
    );
  }

  const RESERVED_KEYS = new Set(['id', 'delay', 'next', 'branches', 'action']);

  const translatedSteps = steps.map((step) => {
    if (!step.delay || typeof step.delay.value !== 'number' || typeof step.delay.unit !== 'string') {
      throw new Error(`Step "${step.id}" is missing a valid delay: { value: number, unit: string }.`);
    }
    const translated = {
      id: step.id,
      delay: {
        value: Number(convertTimingUnit(step.delay.value, step.delay.unit, targetTimingUnit).toFixed(4)),
        unit: targetTimingUnit,
      },
    };
    if (step.next) translated.next = step.next;
    if (step.branches) translated.branches = { ...step.branches };
    if (step.action !== undefined) {
      translated.action = Object.prototype.hasOwnProperty.call(typeMap, step.action) ? typeMap[step.action] : step.action;
    }

    for (const [key, value] of Object.entries(step)) {
      if (RESERVED_KEYS.has(key)) continue;
      const targetKey = Object.prototype.hasOwnProperty.call(fieldMap, key) ? fieldMap[key] : key;
      translated[targetKey] = value;
    }

    return translated;
  });

  return {
    steps: translatedSteps,
    validation,
    sourceStepCount: steps.length,
    targetTimingUnit,
  };
}

module.exports = {
  convertTimingUnit,
  validateStepReferences,
  translateCadence,
  MINUTES_PER_UNIT,
};
