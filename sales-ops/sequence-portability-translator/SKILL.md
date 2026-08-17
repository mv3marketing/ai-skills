---
name: sequence-portability-translator
description: Converts an outbound cadence/sequence between tool schemas via a declarative field-mapping table you supply - handles real timing-unit conversion (minutes/hours/days/business days) and validates the step graph for broken branch references, unreachable steps, and cycles before shipping the translation. Use when migrating a cadence between sales engagement platforms or building your own cadence import/export.
---

# Sequence Portability Translator

A field-mapping and validation engine, not a hardcoded converter for any one real
vendor's exact API schema (those change, and vary by API version — hardcoding them
would go stale immediately). You supply the mapping table; this handles the two parts
that are genuinely easy to get wrong by hand: timing-unit math and step-graph integrity.

## What this is (and isn't)

A pure function over a cadence object and a mapping table you provide. Not a live
integration with any specific sales engagement platform's API — you still need to
write the code that pulls the source cadence out of Tool A and pushes the translated
result into Tool B.

## Files

| File | Purpose |
|---|---|
| `translator.js` | `convertTimingUnit()`, `validateStepReferences()`, `translateCadence()` — zero dependencies |
| `test.js` | 26-test suite covering unit conversion, graph validation (broken refs, unreachable steps, cycles), field mapping, and strict-mode guardrails |

## How to use it

```js
const { translateCadence } = require('./translator.js');

const source = {
  steps: [
    { id: 's1', delay: { value: 0, unit: 'days' }, action: 'email', subject: 'Intro' },
    { id: 's2', delay: { value: 2, unit: 'days' }, action: 'call', next: 's3' },
    { id: 's3', delay: { value: 1, unit: 'business_days' }, action: 'linkedin', branches: { replied: 'exit' } },
  ],
};

const result = translateCadence(source, {
  targetTimingUnit: 'hours',
  fieldMap: { subject: 'emailSubject' },
  typeMap: { email: 'AutoEmail', call: 'PhoneTask', linkedin: 'SocialTask' },
});

// result.steps -> translated cadence with hour-based delays and renamed/remapped fields
// result.validation -> { brokenReferences, unreachableStepIds, cycles } from the SOURCE graph
```

## The two real guardrails

1. **Timing-unit conversion** — every delay is normalized to minutes internally, then
   converted to the target unit. `business_days` uses a documented 7/5 weekend-averaging
   approximation (a true conversion needs an actual start date, which this function
   doesn't have) — the approximation is stated in the code comment, not hidden.
2. **Step-graph validation** — `validateStepReferences()` runs a real BFS reachability
   check and a real DFS cycle detection over the step graph (sequential order + explicit
   `next` + conditional `branches`) before translation. Pass `{ strict: true }` to
   `translateCadence()` to throw on broken references or cycles instead of shipping a
   silently broken cadence with warnings attached.

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only for implementation help
wiring this into your real source and destination platform's actual import/export APIs.
