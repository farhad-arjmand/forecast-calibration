import test from 'node:test';
import assert from 'node:assert/strict';
import { logLoss, evaluateCalibration } from '../dist/index.js';
const day = '2026-01-01';
test('endpoint clipping remains finite and symmetric for every positive epsilon', () => {
  for (const epsilon of [1e-12, 1e-20, Number.MIN_VALUE]) {
    const positive = logLoss([{p: 0, y: 1, day}], epsilon);
    const negative = logLoss([{p: 1, y: 0, day}], epsilon);
    assert.ok(Number.isFinite(negative));
    assert.equal(positive, negative);
    assert.equal(negative, -Math.log(epsilon));
  }
});
test('unrepresentable Brier skill is explicitly null, never infinity', () => {
  const report = evaluateCalibration([{p: 1, y: 0, day}], {
    baselineProbability: 1e-160, bootstrapResamples: 0,
  });
  assert.equal(report.brierSkill, null);
});
test('label-complement symmetry holds for log loss on endpoint-heavy samples', () => {
  const rows = [0, 0.2, 0.5, 0.8, 1].flatMap(p => [0, 1].map(y => ({p, y, day})));
  const flipped = rows.map(s => ({...s, p: 1 - s.p, y: 1 - s.y}));
  assert.ok(Math.abs(logLoss(rows) - logLoss(flipped)) < 1e-12);
});
