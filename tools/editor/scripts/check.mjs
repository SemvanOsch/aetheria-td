/* eslint-env node */
/**
 * Editor self-check (`npm run editor:check`): proves the source export against
 * the real catalogs, in Node, with the editor's own code.
 *
 *  1. The shipped content loads and validates with no errors.
 *  2. Exporting it unchanged reproduces src/domain byte for byte.
 *  3. A scripted batch of edits (every catalog, add/edit/remove/reorder) is
 *     exported into a scratch copy of src/, which is type-checked with the
 *     game's compiler settings and then bundled and loaded again: it must load
 *     as exactly the edited project.
 *  4. Content packs (full and changes-only) round-trip the edited project.
 *
 * Nothing in the repository is modified; the scratch copy lives in
 * node_modules/.tmp/editor-check.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const TMP = join(ROOT, 'node_modules', '.tmp', 'editor-check');

/** Bundle the check module against a given copy of src/ (`@game` alias). */
async function load(srcDir, tag) {
  const outfile = join(TMP, `roundtrip-${tag}.mjs`);
  await build({
    entryPoints: [join(HERE, '../src/check/roundtrip.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'error',
    plugins: [
      {
        name: 'game-alias-and-raw',
        setup(b) {
          b.onResolve({ filter: /^@game\// }, (args) => {
            const [path, query] = args.path.slice('@game/'.length).split('?');
            let file = join(srcDir, path);
            if (!/\.[jt]sx?$/.test(file)) file += '.ts';
            return query === 'raw' ? { path: file, namespace: 'raw' } : { path: file };
          });
          b.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({ contents: readFileSync(args.path, 'utf8'), loader: 'text' }));
        },
      },
    ],
  });
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg, detail) => {
  failed++;
  console.log(`  ✗ ${msg}`);
  if (detail) console.log(String(detail).split('\n').map((l) => `      ${l}`).join('\n'));
};

async function main() {
  mkdirSync(TMP, { recursive: true });
  for (const entry of readdirSync(TMP)) rmSync(join(TMP, entry), { recursive: true, force: true, maxRetries: 3 });
  console.log('Aetheria editor check');

  const shippedMod = await load(join(ROOT, 'src'), 'shipped');
  const report = shippedMod.shippedReport();
  if (report.counts.error === 0) ok(`shipped content validates (0 errors, ${report.counts.warning} warnings, ${report.counts.info} notes)`);
  else fail(`shipped content has ${report.counts.error} validation errors`, report.errors.join('\n'));
  if (report.warnings.length) console.log(report.warnings.map((w) => `      · ${w}`).join('\n'));
  if (report.unchanged) ok('unchanged content exports byte-identical source');
  else fail('exporting unchanged content altered a source file');

  const edited = shippedMod.scriptedEdits(shippedMod.shippedProject());
  const editedCounts = shippedMod.validationCounts(edited);
  if (editedCounts.error === 0) ok('scripted edits validate');
  else fail(`scripted edits have ${editedCounts.error} errors`, editedCounts.errors.join('\n'));

  const files = shippedMod.exportFor(edited);
  const srcCopy = join(TMP, 'src');
  cpSync(join(ROOT, 'src'), srcCopy, { recursive: true });
  for (const f of files) {
    if (f.changed) writeFileSync(join(TMP, f.path), f.updated, 'utf8');
  }
  ok(`exported ${files.filter((f) => f.changed).length} changed file(s): ${files.filter((f) => f.changed).map((f) => f.path).join(', ')}`);

  // Type-check the patched copy with the game's own compiler settings.
  const app = JSON.parse(readFileSync(join(ROOT, 'tsconfig.app.json'), 'utf8'));
  writeFileSync(join(TMP, 'tsconfig.json'), JSON.stringify({ compilerOptions: { ...app.compilerOptions, tsBuildInfoFile: undefined }, include: ['src'] }, null, 2));
  try {
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(TMP, 'tsconfig.json'), '--noEmit'], { stdio: 'pipe' });
    ok('patched catalogs type-check with the game\'s compiler settings');
  } catch (e) {
    fail('patched catalogs fail to type-check', (e.stdout?.toString() || e.message).slice(0, 4000));
  }

  try {
    const reloaded = await load(srcCopy, 'reloaded');
    const got = reloaded.loadedProjectJson();
    const want = shippedMod.projectJson(edited);
    if (got === want) ok('patched catalogs load back as exactly the edited project');
    else {
      const a = JSON.parse(want);
      const b = JSON.parse(got);
      const diffs = [];
      for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs.push(k);
      fail(`reloaded content differs in: ${diffs.join(', ')}`, findFirstDiff(a, b));
    }
  } catch (e) {
    fail('patched catalogs failed to load', e.stack);
  }

  if (shippedMod.packRoundTrip(edited)) ok('content packs (full and changes-only) round-trip');
  else fail('content pack round trip lost data');

  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll editor checks passed.');
  process.exit(failed ? 1 : 0);
}

function findFirstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${path}: expected ${JSON.stringify(a)?.slice(0, 300)}, got ${JSON.stringify(b)?.slice(0, 300)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = findFirstDiff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return '';
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
