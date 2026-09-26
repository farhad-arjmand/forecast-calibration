import { evaluateCalibration, brierScore, type Forecast } from '../dist/index.js';
const rows: Forecast[] = [{ p: 0.5, y: 1, day: '2024-01-01' }];
const score: number | null = brierScore(rows);
evaluateCalibration(rows, { baselineProbability: 0.5 });
// @ts-expect-error A label is binary, not an arbitrary number.
const invalid: Forecast = { p: 0.5, y: 2, day: '2024-01-01' };
void score; void invalid;
