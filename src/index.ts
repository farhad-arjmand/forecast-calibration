export interface Forecast { p: number; y: 0 | 1; day: string }
export interface ReliabilityBin {
  count: number; minP: number; maxP: number; meanP: number; observed: number;
}
export interface CalibrationOptions {
  /** Constant probability established independently of the evaluation labels. */
  baselineProbability: number;
  bins?: number;
  bootstrapResamples?: number;
  seed?: number;
  logLossEpsilon?: number;
}
export interface Interval {
  lower: number | null; upper: number | null; requested: number; valid: number; days: number;
}
const probability = (p: unknown): p is number => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;
const dayValid = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

/** Invalid rows are counted and excluded; each row receives its first exclusion reason. */
export function screenForecasts(raw: readonly unknown[]) {
  const samples: Forecast[] = [];
  const excluded = { label: 0, probability: 0, day: 0 };
  for (const row of raw) {
    const s = row as Partial<Forecast> | null;
    if (!s || (s.y !== 0 && s.y !== 1)) { excluded.label++; continue; }
    if (!probability(s.p)) { excluded.probability++; continue; }
    if (!dayValid(s.day)) { excluded.day++; continue; }
    samples.push({ p: s.p, y: s.y, day: s.day });
  }
  return { samples, excluded };
}
function validate(samples: readonly Forecast[]) {
  for (const s of samples) {
    if (!s || !probability(s.p) || (s.y !== 0 && s.y !== 1) || !dayValid(s.day)) {
      throw new RangeError('Invalid forecast; use screenForecasts to count exclusions');
    }
  }
}
function brierUnchecked(samples: readonly Forecast[], constant?: number): number | null {
  if (!samples.length) return null;
  return samples.reduce((sum, s) => sum + ((constant ?? s.p) - s.y) ** 2, 0) / samples.length;
}
export function brierScore(samples: readonly Forecast[]): number | null {
  validate(samples); return brierUnchecked(samples);
}
export function logLoss(samples: readonly Forecast[], epsilon = 1e-12): number | null {
  validate(samples);
  if (!Number.isFinite(epsilon) || epsilon <= 0 || epsilon >= 0.5) throw new RangeError('Invalid log-loss epsilon');
  if (!samples.length) return null;
  return samples.reduce((sum, s) => {
    // Clip the observed class probability directly: 1 - epsilon may round to 1.
    const observed = s.y === 1 ? s.p : 1 - s.p;
    return sum - Math.log(Math.max(epsilon, Math.min(1 - epsilon, observed)));
  }, 0) / samples.length;
}

/** Mann–Whitney rank AUC, O(n log n), ties receive half credit; one class => null. */
export function rocAuc(samples: readonly Forecast[]): number | null {
  validate(samples);
  const sorted = [...samples].sort((a, b) => a.p - b.p);
  let positives = 0, negatives = 0, wins = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i, pos = 0, neg = 0;
    while (j < sorted.length && sorted[j]!.p === sorted[i]!.p) {
      if (sorted[j]!.y === 1) pos++; else neg++;
      j++;
    }
    wins += pos * (negatives + neg / 2);
    positives += pos; negatives += neg; i = j;
  }
  return positives && negatives ? wins / (positives * negatives) : null;
}

/** Approximately equal-count bins, never splitting equal forecast probabilities. */
export function reliabilityBins(samples: readonly Forecast[], count = 10): ReliabilityBin[] {
  validate(samples);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new RangeError('Invalid bin count');
  const sorted = [...samples].sort((a, b) => a.p - b.p);
  const bins: ReliabilityBin[] = [];
  const width = Math.max(1, Math.ceil(sorted.length / count));
  for (let i = 0; i < sorted.length;) {
    let end = Math.min(sorted.length, i + width);
    while (end < sorted.length && sorted[end]!.p === sorted[end - 1]!.p) end++;
    const part = sorted.slice(i, end);
    bins.push({ count: part.length, minP: part[0]!.p, maxP: part[part.length - 1]!.p,
      meanP: part.reduce((a, s) => a + s.p, 0) / part.length,
      observed: part.reduce((a, s) => a + s.y, 0) / part.length });
    i = end;
  }
  return bins;
}
function skill(score: number | null, baseline: number | null): number | null {
  const value = score !== null && baseline !== null && baseline > 0 ? 1 - score / baseline : null;
  return value !== null && Number.isFinite(value) ? value : null;
}
function rng(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
/** Linear-interpolated quantile of an ascending array. */
function quantile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const at = (values.length - 1) * p;
  const lo = Math.floor(at), hi = Math.ceil(at);
  return values[lo]! + (values[hi]! - values[lo]!) * (at - lo);
}

export function evaluateCalibration(raw: readonly unknown[], options: CalibrationOptions) {
  const baseline = options.baselineProbability;
  const resamples = options.bootstrapResamples ?? 1000;
  const seed = options.seed ?? 1;
  if (!probability(baseline)) throw new RangeError('baselineProbability must be in [0, 1]');
  if (!Number.isSafeInteger(resamples) || resamples < 0 || resamples > 10000) throw new RangeError('Invalid bootstrapResamples');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid seed');
  const { samples, excluded } = screenForecasts(raw);
  const bins = reliabilityBins(samples, options.bins ?? 10);
  const n = samples.length;
  const prevalence = n ? samples.reduce((a, s) => a + s.y, 0) / n : null;
  const brier = brierUnchecked(samples), baselineBrier = brierUnchecked(samples, baseline);
  const loss = logLoss(samples, options.logLossEpsilon ?? 1e-12);
  const baselineLoss = logLoss(samples.map(s => ({ ...s, p: baseline })), options.logLossEpsilon ?? 1e-12);
  const ece = n ? bins.reduce((a, b) => a + b.count / n * Math.abs(b.meanP - b.observed), 0) : null;
  const reliability = n ? bins.reduce((a, b) => a + b.count / n * (b.meanP - b.observed) ** 2, 0) : null;
  const resolution = n ? bins.reduce((a, b) => a + b.count / n * (b.observed - prevalence!) ** 2, 0) : null;
  const uncertainty = prevalence === null ? null : prevalence * (1 - prevalence);
  const binnedBrier = reliability === null ? null : reliability - resolution! + uncertainty!;
  const groups = new Map<string, Forecast[]>();
  for (const s of samples) {
    if (!groups.has(s.day)) groups.set(s.day, []);
    groups.get(s.day)!.push(s);
  }
  // Sorted day keys make resampling independent of first-observed day ordering.
  const days = [...groups.keys()].sort().map(day => groups.get(day)!);
  const drawRandom = rng(seed), values: number[] = [];
  // A single block cannot support a useful between-day uncertainty estimate.
  if (days.length >= 2) {
    for (let i = 0; i < resamples; i++) {
      let count = 0, score = 0, control = 0;
      for (let j = 0; j < days.length; j++) {
        const block = days[Math.floor(drawRandom() * days.length)]!;
        for (const s of block) { score += (s.p - s.y) ** 2; control += (baseline - s.y) ** 2; count++; }
      }
      const value = skill(score / count, control / count);
      if (value !== null && Number.isFinite(value)) values.push(value);
    }
  }
  values.sort((a, b) => a - b);
  const interval: Interval = { lower: quantile(values, 0.025), upper: quantile(values, 0.975),
    requested: resamples, valid: values.length, days: days.length };
  return { n, days: days.length, excluded, prevalence, brier, baselineBrier,
    brierSkill: skill(brier, baselineBrier), logLoss: loss, baselineLogLoss: baselineLoss,
    auc: rocAuc(samples), ece, bins,
    decomposition: { reliability, resolution, uncertainty, binnedBrier,
      rawMinusBinned: brier === null ? null : brier - binnedBrier! },
    brierSkillInterval95: interval,
    intervalStatus: resamples === 0 ? 'DISABLED' : days.length < 2 ? 'INSUFFICIENT_BLOCKS' :
      values.length === 0 ? 'UNDEFINED' : values.length < resamples ? 'PARTIAL' : 'AVAILABLE',
    warnings: ['Descriptive diagnostics, not a calibration certificate or evidence of profit.',
      'Day-block resampling assumes day blocks are representative and sufficiently independent.'] };
}
