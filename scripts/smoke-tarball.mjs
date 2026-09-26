import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const temporary = mkdtempSync(join(tmpdir(), 'public-package-smoke-'));
try {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], { encoding: 'utf8', timeout: 60000 }));
  const consumer = join(temporary, 'consumer');
  execFileSync('npm', ['install', '--prefix', consumer, '--ignore-scripts', '--package-lock=false',
    '--no-audit', '--no-fund', join(temporary, pack.filename)], { encoding: 'utf8', timeout: 60000 });
  const installed = join(consumer, 'node_modules', metadata.name);
  for (const file of ['docs/API.md','llms.txt','CHANGELOG.md']) assert.ok(readFileSync(join(installed, file), 'utf8').length);
  const smoke = join(consumer, 'smoke.mjs');
  const checks = "const rows=[{p:0.8,y:1,day:'2026-01-01'},{p:0.2,y:0,day:'2026-01-02'}];\nconst report=api.evaluateCalibration(rows,{baselineProbability:0.5,bootstrapResamples:20,seed:7});\nassert.ok(Math.abs(report.brier-0.04)<1e-12);\nassert.equal(report.auc,1);\nassert.equal(api.logLoss([{p:1,y:0,day:'2026-01-01'}],1e-20),-Math.log(1e-20));";
  writeFileSync(smoke, 'import assert from "node:assert/strict";\nimport * as api from ' + JSON.stringify(metadata.name) + ';\n' + checks);
  execFileSync(process.execPath, [smoke], { encoding: 'utf8', timeout: 5000 });

  // Execute exactly what a reader copies from the packaged README, using public imports.
  const readme = readFileSync(join(installed, 'README.md'), 'utf8');
  const examples = [...readme.matchAll(/\x60\x60\x60js\r?\n([\s\S]*?)\x60\x60\x60/g)];
  assert.ok(examples.length, 'README must contain a runnable JavaScript example');
  for (const [i, match] of examples.entries()) {
    const path = join(consumer, 'readme-' + i + '.mjs');
    writeFileSync(path, match[1]);
    execFileSync(process.execPath, [path], { encoding: 'utf8', timeout: 5000 });
  }

  // Resolve declarations from the installed package rather than source-relative dist.
  const typed = readFileSync(new URL('../test/consumer.ts', import.meta.url), 'utf8')
    .replaceAll('../dist/index.js', metadata.name);
  const typedPath = join(consumer, 'consumer.mts');
  writeFileSync(typedPath, typed);
  const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
  execFileSync(process.execPath, [tsc, '--noEmit', '--strict', '--module', 'NodeNext',
    '--target', 'ES2022', typedPath], { encoding: 'utf8', timeout: 30000 });
  console.log('Isolated tarball verified: API assertions, ' + examples.length + ' README example(s), bundled docs and public TypeScript imports: ' + metadata.name);
} finally {
  // Only this script's newly created temporary directory is removed.
  rmSync(temporary, { recursive: true, force: true });
}
