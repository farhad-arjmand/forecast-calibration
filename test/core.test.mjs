import test from 'node:test';
import assert from 'node:assert/strict';
import { brierScore, logLoss, rocAuc, reliabilityBins, screenForecasts, evaluateCalibration } from '../dist/index.js';
const rows = [[.9,1],[.1,0],[.8,0],[.2,1]].map(([p,y], i) => ({p,y,day: `2024-01-0${1 + (i % 2)}`}));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
test('metrics match hand calculation', () => {
  near(brierScore(rows), .325);
  near(logLoss(rows), -(Math.log(.9) + Math.log(.2)) / 2);
  near(rocAuc(rows), .75);
});
test('ties receive half credit and single-class AUC is unknown', () => {
  near(rocAuc(rows.map(s => ({ ...s, p: .5 }))), .5);
  assert.equal(rocAuc(rows.map(s => ({ ...s, y: 1 }))), null);
  near(rocAuc([{p:.5,y:0,day:'2024-01-01'},{p:.5,y:1,day:'2024-01-01'},{p:.8,y:1,day:'2024-01-01'}]), .75);
});
test('rank AUC agrees with independent pairwise oracle for 30 tie-heavy samples', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const xs = Array.from({length:80}, (_,i) => ({p: ((i*seed + 7) % 11) / 10, y: i % 2, day:'2024-01-01'}));
    const pos = xs.filter(s=>s.y===1), neg = xs.filter(s=>s.y===0);
    let wins=0; for(const p of pos) for(const n of neg) wins += p.p > n.p ? 1 : p.p === n.p ? .5 : 0;
    near(rocAuc(xs), wins / (pos.length * neg.length));
  }
});
test('strict calendar screening counts malformed and impossible dates', () => {
  const result = screenForecasts([null, {p:.3,y:2}, {p:'0.3',y:1}, {p:.2,y:0,day:'2024-02-30'},
    {p:.2,y:0,day:'2023-02-29'}, {p:.2,y:0,day:'2024-02-29'}]);
  assert.deepEqual(result.excluded, {label:2,probability:1,day:2});
  assert.equal(result.samples.length, 1);
});
test('bins never split tied forecasts and maxBins=1 is respected', () => {
  const xs = Array.from({length:90}, (_,i)=>({p:i<70?.2:.8,y:i%2,day:'2024-01-01'}));
  const bins = reliabilityBins(xs, 10);
  assert.equal(bins.length, 2);
  assert.equal(bins.reduce((n,b)=>n+b.count,0),90);
  assert.equal(reliabilityBins(xs,1).length,1);
});
test('binned Murphy identity is not misrepresented as raw Brier identity', () => {
  const r = evaluateCalibration(rows, {baselineProbability:.5, bins:1, bootstrapResamples:0});
  near(r.decomposition.binnedBrier, .25);
  near(r.decomposition.rawMinusBinned, .075);
  near(r.brier, r.decomposition.binnedBrier + r.decomposition.rawMinusBinned);
  assert.equal(r.intervalStatus,'DISABLED');
});
test('bootstrap is seeded and samples whole day blocks', () => {
  const xs = [{p:1,y:1,day:'2024-01-01'}, {p:0,y:1,day:'2024-01-02'}];
  const opts = {baselineProbability:.5, bootstrapResamples:300,seed:42};
  const r=evaluateCalibration(xs,opts);
  assert.deepEqual(r,evaluateCalibration(xs,opts));
  assert.equal(r.brierSkillInterval95.lower,-3);
  assert.equal(r.brierSkillInterval95.upper,1);
  assert.equal(r.brierSkillInterval95.valid,300);
});
test('undefined baseline skill and one-block intervals stay null', () => {
  const r = evaluateCalibration([{p:0,y:0,day:'2024-01-01'}], {baselineProbability:0});
  assert.equal(r.brierSkill,null);
  assert.equal(r.brierSkillInterval95.lower,null);
  assert.equal(r.intervalStatus,'INSUFFICIENT_BLOCKS');
});
test('empty inputs do not turn into zero metrics', () => {
  const r=evaluateCalibration([], {baselineProbability:.5});
  for(const key of ['brier','logLoss','auc','ece','prevalence']) assert.equal(r[key],null);
  assert.equal(r.n,0);
});
test('zero and one probabilities produce finite clipped log loss', () => {
  assert.ok(Number.isFinite(logLoss([{p:0,y:1,day:'2024-01-01'}])));
  near(brierScore([{p:0,y:1,day:'2024-01-01'}]),1);
});
test('invalid options and unscreened malformed samples reject', () => {
  assert.throws(()=>evaluateCalibration(rows,{baselineProbability:NaN}));
  assert.throws(()=>evaluateCalibration(rows,{baselineProbability:.5,bootstrapResamples:-1}));
  assert.throws(()=>evaluateCalibration(rows,{baselineProbability:.5,seed:-1}));
  assert.throws(()=>reliabilityBins(rows,0));
  assert.throws(()=>logLoss(rows,0));
  assert.throws(()=>brierScore([{p:2,y:0,day:'2024-01-01'}]));
});
test('inputs remain unmodified',()=>{
  const snapshot=JSON.stringify(rows);evaluateCalibration(rows,{baselineProbability:.5,bootstrapResamples:20});
  assert.equal(JSON.stringify(rows),snapshot);
});
