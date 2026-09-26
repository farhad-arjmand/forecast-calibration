# Forecast Calibration

Small, deterministic diagnostics for binary probability forecasts: Brier score, log loss, tie-aware ROC AUC, reliability bins, ECE, and a seeded day-block bootstrap.

**Experimental v0.1.1 · TypeScript · ESM · Node.js 22+ · MIT · zero runtime dependencies**

[![CI](https://github.com/farhad-arjmand/forecast-calibration/actions/workflows/ci.yml/badge.svg)](https://github.com/farhad-arjmand/forecast-calibration/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40farhadarjmand%2Fforecast-calibration)](https://www.npmjs.com/package/@farhadarjmand/forecast-calibration)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/farhad-arjmand/forecast-calibration/blob/main/LICENSE)

[API reference](https://github.com/farhad-arjmand/forecast-calibration/blob/main/docs/API.md) · [Changelog](https://github.com/farhad-arjmand/forecast-calibration/blob/main/CHANGELOG.md) · [Documentation map](https://github.com/farhad-arjmand/forecast-calibration/blob/main/llms.txt) · [Report an issue](https://github.com/farhad-arjmand/forecast-calibration/issues/new/choose)

## When to use this

Evaluate binary classifier probabilities, prepare reliability diagrams, and compare frozen forecasts against an independently specified constant baseline. Applicable to machine-learning evaluation and probabilistic forecasting, not only finance.

Diagnostics do not train or recalibrate a model. They cannot detect data leakage, establish profitability, or certify calibration.

## Get started

Install the ESM package:

```sh
npm install @farhadarjmand/forecast-calibration
```

To build and test from source:

```sh
git clone https://github.com/farhad-arjmand/forecast-calibration.git
cd forecast-calibration
npm ci --ignore-scripts
npm run check
```

```js
import { evaluateCalibration } from '@farhadarjmand/forecast-calibration';

const report = evaluateCalibration([
  { p: 0.8, y: 1, day: '2024-01-01' },
  { p: 0.2, y: 0, day: '2024-01-01' },
  { p: 0.6, y: 0, day: '2024-01-02' },
  { p: 0.7, y: 1, day: '2024-01-02' },
], { baselineProbability: 0.5, bootstrapResamples: 1000, seed: 7 });

console.log(report.brier, report.auc, report.brierSkillInterval95);
```

Package: [`@farhadarjmand/forecast-calibration`](https://www.npmjs.com/package/@farhadarjmand/forecast-calibration).

## Input and exclusions

Each sample has a finite numeric `p` in [0,1], binary numeric `y`, and a real UTC calendar date `day` formatted YYYY-MM-DD. Impossible dates such as 2024-02-30 are rejected. Dates should group samples by the **forecast decision day**, not by when the eventual outcome became known.

`evaluateCalibration` screens unknown input, counts each rejected row under its first failure (label, probability, then day), and excludes it. It never turns an unknown label into zero. Individual metric functions require valid samples and throw on malformed input.

Forecasts must have been frozen before their outcomes. This library cannot verify your training split, label availability, leakage, or baseline provenance.

## Metrics

| Output | Meaning |
| --- | --- |
| brier | Mean (p − y)²; lower is better. |
| brierSkill | 1 − Brier / constant-baseline Brier; null if baseline error is zero or the ratio is not representable as a finite number. |
| logLoss | Natural-log loss, clipping only this metric to epsilon (default 1e-12). |
| auc | Rank discrimination, O(n log n); ties receive half credit. Null for one class, 0.5 for constant scores when both classes exist. |
| bins / ece | Approximately equal-count reliability bins without splitting tied scores; ECE depends on binning. |
| decomposition | Reliability − resolution + uncertainty equals **binned** Brier, not necessarily raw Brier. rawMinusBinned explicitly records the residual. |
| brierSkillInterval95 | Percentile interval from resampling entire decision-day blocks. |

The baseline probability is supplied explicitly; do not choose it from the evaluation labels. Endpoint probabilities 0 and 1 are allowed. Null means undefined or unavailable, not zero.

## API

- `screenForecasts(raw)`
- `brierScore(samples)`
- `logLoss(samples, epsilon?)`
- `rocAuc(samples)`
- `reliabilityBins(samples, count = 10)`
- `evaluateCalibration(raw, options)`

Options: required `baselineProbability`; optional `bins` (1–1000), `bootstrapResamples` (0–10000, default 1000), unsigned 32-bit `seed` (default 1), and `logLossEpsilon`.

A bootstrap resamples the same number of day blocks with replacement, retaining every row of each sampled day. It estimates a **sample-weighted** statistic, not an equal-day-weighted one. Day keys are sorted before resampling. At least two blocks are required to emit an interval; two is a mathematical minimum, not a statistical adequacy claim. Invalid zero-denominator or non-finite draws are counted via requested/valid and PARTIAL status. Setting resamples to zero disables intervals.

Blocks must be representative and sufficiently independent for the intended inference. Serial dependence across days, overlapping labels, selection bias, tuning, and multiple tests require an appropriate study design outside this package. Small samples can produce misleadingly narrow or degenerate intervals.

## What this does not do

It does not train a calibrator, certify probabilities, infer a trading edge, select a strategy, or promote a model. A positive skill interval does not prove calibration; discrimination and calibration are distinct. No universal sample-size threshold or automatic “calibrated” label is emitted.

## Verification

Tests compare metrics against hand values and an independent pairwise AUC oracle, cover tie handling, strict date screening, raw/binned decomposition, deterministic block resampling, empty samples, and undefined baselines. Fixtures are synthetic.

See [Provenance](https://github.com/farhad-arjmand/forecast-calibration/blob/main/NOTICE.md), [Contributing](https://github.com/farhad-arjmand/forecast-calibration/blob/main/CONTRIBUTING.md), and [MIT license](https://github.com/farhad-arjmand/forecast-calibration/blob/main/LICENSE).

## Integration and reproducibility

ESM named imports only; tested on Node.js 22 and 24. Types are bundled. Browser and CommonJS support are not claimed. The package includes `docs/API.md` and `llms.txt` so humans and coding assistants can inspect the installed version's contract offline. A documentation map does not guarantee search ranking or AI indexing.

For contributors, `npm run test:package` installs a freshly packed tarball in a temporary consumer, executes the README example, checks a functional assertion and type-checks imports by the public package name. Pin the package version and retain your input identity and options when comparing results.
