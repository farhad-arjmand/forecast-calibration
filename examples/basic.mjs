import { evaluateCalibration } from '../dist/index.js';

const forecasts = [
  { p: 0.8, y: 1, day: '2024-01-01' },
  { p: 0.2, y: 0, day: '2024-01-01' },
  { p: 0.6, y: 0, day: '2024-01-02' },
  { p: 0.7, y: 1, day: '2024-01-02' },
];
console.log(JSON.stringify(evaluateCalibration(forecasts, {
  baselineProbability: 0.5, bootstrapResamples: 100, seed: 7,
}), null, 2));
