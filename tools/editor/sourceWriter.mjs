/* eslint-env node */
/**
 * Dev-server-only bridge that lets the content editor write its generated
 * TypeScript back into `src/domain` — but only when the user explicitly asks
 * (Content Packs → Source export → "Write to src/domain"), only for the four
 * catalog files below, and only if each file still matches the exact text the
 * editor generated from (otherwise nothing is written and the editor says why).
 *
 * It is never part of a build (`apply: 'serve'`), refuses requests from other
 * origins, and needs a custom header so a page elsewhere can't trigger it.
 *
 * It also turns any edit under `src/` into a full page reload of the editor, so
 * the shipped baseline the editor loaded always matches the files on disk.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/** Repo-relative files the editor may overwrite. */
export const WRITABLE_FILES = [
  'src/domain/levels.ts',
  'src/domain/enemies.ts',
  'src/domain/units.ts',
  'src/domain/mastery.ts',
];

const API = '/__aetheria-editor';
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MAX_BODY = 8 * 1024 * 1024;

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error('Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

export function editorSourcePlugin({ repoRoot }) {
  const srcDir = resolve(repoRoot, 'src') + sep;
  const abs = (rel) => resolve(repoRoot, rel);

  return {
    name: 'aetheria-editor-source',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use(API, async (req, res) => {
        const origin = req.headers.origin;
        if (origin && !LOCAL_ORIGIN.test(origin)) return send(res, 403, { error: 'Foreign origin refused.' });
        const url = new URL(req.url ?? '/', 'http://localhost');

        if (req.method === 'GET' && url.pathname === '/status') {
          const files = {};
          for (const rel of WRITABLE_FILES) {
            files[rel] = existsSync(abs(rel)) ? { hash: sha256(readFileSync(abs(rel), 'utf8')) } : null;
          }
          return send(res, 200, { writable: true, files });
        }

        if (req.method === 'POST' && url.pathname === '/write') {
          if (req.headers['x-aetheria-editor'] !== '1') return send(res, 403, { error: 'Missing editor header.' });
          let payload;
          try {
            payload = JSON.parse(await readBody(req));
          } catch (e) {
            return send(res, 400, { error: `Bad request: ${e.message}` });
          }
          const files = Array.isArray(payload?.files) ? payload.files : [];
          if (files.length === 0) return send(res, 400, { error: 'No files to write.' });
          // Check everything first: all files are written, or none are.
          const stale = [];
          for (const f of files) {
            if (!WRITABLE_FILES.includes(f?.path)) return send(res, 400, { error: `Not a writable file: ${f?.path}` });
            if (typeof f.content !== 'string' || typeof f.baseHash !== 'string') {
              return send(res, 400, { error: `Malformed entry for ${f.path}` });
            }
            const current = existsSync(abs(f.path)) ? readFileSync(abs(f.path), 'utf8') : '';
            if (sha256(current) !== f.baseHash) stale.push(f.path);
          }
          if (stale.length > 0) {
            return send(res, 409, {
              error: 'These files changed on disk after the editor loaded them. Nothing was written; reload the editor and export again.',
              stale,
            });
          }
          for (const f of files) {
            const target = abs(f.path);
            const tmp = `${target}.editor-tmp`;
            writeFileSync(tmp, f.content, 'utf8');
            renameSync(tmp, target);
          }
          server.config.logger.info(`[editor] wrote ${files.map((f) => f.path).join(', ')}`, { timestamp: true });
          return send(res, 200, { written: files.map((f) => f.path) });
        }

        return send(res, 404, { error: 'Unknown editor endpoint.' });
      });
    },

    // Source edits (the Write action, or a hand edit) change the shipped
    // baseline: reload rather than hot-patch half the module graph.
    handleHotUpdate({ file, server }) {
      if (resolve(file).startsWith(srcDir)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
      return undefined;
    },
  };
}
