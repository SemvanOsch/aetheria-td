/* eslint-env node */
/**
 * Vite config for the Aetheria content editor — a separate app from the game.
 *
 *   npm run editor         dev server on http://localhost:5175 (direct source export on)
 *   npm run editor:build   static build into tools/editor/dist (downloads only)
 *
 * The editor imports the game's domain catalogs, engine and renderer through the
 * `@game/*` alias. The game's own build (`vite build` at the repo root) never
 * sees this directory, so nothing here ships to players.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editorSourcePlugin } from './sourceWriter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;

export default defineConfig({
  root: here,
  // Relative asset URLs, so the static build opens from any folder or server.
  base: './',
  // The game's public assets (ability icons) for the test-play HUD.
  publicDir: resolve(repoRoot, 'public'),
  resolve: {
    alias: { '@game': resolve(repoRoot, 'src') },
  },
  plugins: [react(), editorSourcePlugin({ repoRoot })],
  server: {
    port: envPort ?? 5175,
    strictPort: envPort != null,
    fs: { allow: [repoRoot] },
  },
  preview: { port: 5176 },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
});
