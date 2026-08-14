---
name: health-score-weight-calibrator
description: Statistically fits customer-health-score signal weights against real renewal/churn outcomes via L2-regularized logistic regression, instead of hand-guessing weights in a config UI. Use when a team has historical account data (signals + churned/renewed outcome) and wants a defensible, fitted health-score model.
---

# Health-Score Weight Calibrator

Most CS platforms (including Gainsight's own AI Scorecards) treat health-score weighting as a
config UI where a human guesses "usage = 40%, tickets = 30%, NPS = 30%." This skill instead
fits those weights statistically against your own historical renewal/churn outcomes.

## What this is (and isn't)

A calibration function, not a hosted service or a CS platform. It runs entirely in your own
environment against a dataset you supply — nothing leaves your machine.

## Files

| File | Purpose |
|---|---|
| `calibrator.js` | `calibrateWeights()` (fits the model) and `scoreAccount()` (scores a live account against a fitted model) |
| `test.js` | 14-test suite covering convergence, sign-correctness, edge cases, and determinism |

## How to use it

1. Assemble historical account rows: `{ signals: { usage: 62, tickets: 3, nps: 8 }, churned: 0 }` — one row per closed (renewed or churned) account, using whatever numeric signals you already track.
2. Call `calibrateWeights(rows)`. It z-score-normalizes every signal, then fits weights via batch gradient descent with L2 regularization so a handful of noisy outliers can't dominate the fit.
3. Call `scoreAccount(liveSignals, model)` for any open account to get a 0-100 health score (100 = lowest churn risk).

```js
const { calibrateWeights, scoreAccount } = require('./calibrator.js');

const model = calibrateWeights(historicalAccounts);
// model.weights -> { usage: -0.84, tickets: 0.61, nps: -0.39 }
// model.accuracy, model.logLoss -> how well the fit actually explains your historical outcomes

const score = scoreAccount({ usage: 71, tickets: 1, nps: 9 }, model);
```

## Why this is a real gap, not a checklist

Even Gainsight's own AI Scorecards present weighting as a config UI, not a statistical fit
against outcomes. This skill closes that gap with an actual fitted model — including
reporting `accuracy` and `logLoss` so you can see, honestly, how well the weights it produces
actually explain your own churn history, rather than presenting a black-box score with no
way to check its calibration.

## Requirements

- At least 4 historical account rows, with both churned and renewed examples present.
- Every signal must be a plain number on every row (no missing values, no strings).

## Free / paid

Free to download and run yourself. MV3 charges $175/hr only if you want it wired into your
real CS platform (Gainsight, Vitally, Planhat, HubSpot, or a homegrown system) and your
signals piped in automatically.
