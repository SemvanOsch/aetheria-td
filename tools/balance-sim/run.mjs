/* eslint-env node */
/**
 * Balance simulator: plays stages headlessly with a bot on the real engine and
 * builds a report page from the results.
 *
 *   npm run balance                         every campaign stage (1-10)
 *   npm run balance -- --stages 1-5         a range (or a list: 3,8,10)
 *   npm run balance -- --stages 8 --jobs 2  fewer parallel processes
 *   npm run balance -- --seeds 1            faster, noisier
 *   npm run balance -- --heroes Staff,Claymore --teams starter,rares
 *   npm run balance -- --report             rebuild the report from saved results only
 *
 * One worker process runs per stage, at most `--jobs` at a time (default 4,
 * never more than 5). Results land in tools/balance-sim/out/runs/stage-N.json;
 * a rerun replaces only the stages it played, so the report always shows the
 * latest run of every stage. The page is written to tools/balance-sim/out/report.html.
 */
import { build } from 'esbuild';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildReport } from './report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const RUNS = join(OUT, 'runs');
const MAX_JOBS = 5;

function parseArgs(argv) {
  const opts = { stages: '1-10', jobs: 4, seeds: 3, heroes: 'all', teams: 'all', report: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--report') opts.report = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  }
  opts.jobs = Math.max(1, Math.min(MAX_JOBS, Number(opts.jobs) || 4));
  opts.seeds = Math.max(1, Number(opts.seeds) || 3);
  return opts;
}

function parseStages(spec) {
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const [a, b] = part.split('-').map((n) => Number(n.trim()));
    if (!Number.isInteger(a)) throw new Error(`Bad --stages value "${spec}"`);
    for (let s = a; s <= (Number.isInteger(b) ? b : a); s++) out.add(s);
  }
  return [...out].sort((x, y) => x - y);
}

function runWorker(script, stage, opts) {
  return new Promise((resolve, reject) => {
    const file = join(RUNS, `stage-${stage}.json`);
    const child = spawn(process.execPath, [script, String(stage), file, String(opts.seeds), opts.heroes, opts.teams], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (d) => process.stdout.write(String(d).replace(/^progress /gm, '  stage ')));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`stage ${stage} worker exited with code ${code}`))));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(RUNS, { recursive: true });

  if (!opts.report) {
    const stages = parseStages(opts.stages);
    const script = join(OUT, '.build', 'worker.mjs');
    await build({
      entryPoints: [join(HERE, 'worker.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: script,
      logLevel: 'warning',
    });
    console.log(`Simulating stages ${stages.join(', ')} with ${opts.jobs} process(es), ${opts.seeds} seed(s) each...`);
    const t0 = Date.now();
    const queue = [...stages];
    const lanes = Array.from({ length: Math.min(opts.jobs, queue.length) }, async () => {
      while (queue.length) {
        const stage = queue.shift();
        const s0 = Date.now();
        await runWorker(script, stage, opts);
        console.log(`Stage ${stage} done in ${Math.round((Date.now() - s0) / 1000)}s`);
      }
    });
    await Promise.all(lanes);
    console.log(`All stages done in ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  if (!existsSync(RUNS)) throw new Error('No saved results yet; run without --report first.');
  const page = buildReport(RUNS, join(HERE, 'report.template.html'), join(OUT, 'report.html'));
  console.log(`Report written to ${page}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
