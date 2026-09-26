# API reference

## Import and input

Named ESM exports from `@farhadarjmand/forecast-calibration`; Node.js 22+ tested, TypeScript declarations included. No default or CommonJS export.

`Forecast = { p: number, y: 0 | 1, day: string }`. Probability must be finite in [0,1]; day must be an actual YYYY-MM-DD UTC date. Group by forecast decision day, not label-resolution day. All single-metric functions require valid Forecast rows, including day, and throw RangeError for malformed rows. Empty inputs return null metrics or an empty bin array.

## Functions

| Function | Return / meaning |
| --- | --- |
| screenForecasts(raw) | {samples, excluded: {label, probability, day}}; each invalid row counted once, first failure wins |
| brierScore(samples) | mean (p − y)² |
| logLoss(samples, epsilon = 1e-12) | mean negative natural log of observed-class probability, clipped to [epsilon, 1 − epsilon] |
| rocAuc(samples) | rank AUC; equal scores receive half credit; one class => null |
| reliabilityBins(samples, count = 10) | approximately equal-count bins, tied scores never split |
| evaluateCalibration(raw, options) | screened diagnostics, bin decomposition, baseline comparison and bootstrap interval |

Epsilon must be finite and strictly between 0 and 0.5. Clipping changes log loss only. Even Number.MIN_VALUE is supported; tiny epsilon can round the upper bound to 1 but wrong-class endpoint losses remain finite.

Each reliability bin has `count, minP, maxP, meanP, observed`. For a reliability diagram, plot meanP against observed, annotate count, and compare with the identity line. Requested bin count is an upper bound; ties can reduce it.

## Evaluation options

| Option | Default | Contract |
| --- | --- | --- |
| baselineProbability | required | finite [0,1], chosen independently of evaluation labels |
| bins | 10 | integer 1–1000 |
| bootstrapResamples | 1000 | integer 0–10000; 0 disables intervals |
| seed | 1 | unsigned 32-bit integer; 0 and 1 intentionally initialize the same nonzero PRNG state |
| logLossEpsilon | 1e-12 | as above |

## Report

- `n, days, excluded, prevalence`: retained sample and day counts, rejection totals and event fraction.
- `brier, baselineBrier, brierSkill`: skill = 1 − Brier / baselineBrier. Zero-denominator or non-finite skill is null, not zero.
- `logLoss, baselineLogLoss, auc, ece, bins`: complementary diagnostics. Good AUC does not imply calibrated probabilities.
- `decomposition`: reliability, resolution, uncertainty, binnedBrier and rawMinusBinned. The Murphy identity is for **binned** probabilities; the raw score need not equal it.
- `brierSkillInterval95`: lower, upper, requested, valid, days. Bounds are null if no valid draws exist.
- `intervalStatus`: DISABLED, INSUFFICIENT_BLOCKS, UNDEFINED, PARTIAL or AVAILABLE.
- `warnings`: descriptive/inference limitations, not certification.

At least two day blocks are needed. Days are sorted, then entire day blocks are sampled with replacement, retaining all their rows. The statistic is sample-weighted, not equal-day weighted. Zero-denominator and non-finite draws are excluded and counted as invalid; PARTIAL intervals require caution.

## Limits and complexity

ROC AUC and binning sort in O(n log n). Current bootstrap is O(resamples × n), with O(n + resamples) working memory. Bound sample sizes and resamples in interactive applications.

Serial dependence between days, overlapping targets, selection and multiple testing are not corrected automatically. Two days is a mathematical minimum, not sufficient evidence for a useful confidence interval. Save the options, raw-input identity and package version with results.

Inputs are not mutated. No I/O, training, label inference or live model promotion occurs.
