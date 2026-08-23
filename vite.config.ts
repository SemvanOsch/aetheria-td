import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal ambient declaration so we can read the harness-assigned PORT without
// pulling in @types/node just for the config file.
declare const process: { env: Record<string, string | undefined> };

// https://vitejs.dev/config/
export default defineConfig(() => {
  // Honor a port assigned via the PORT env var (used by the preview harness /
  // autoPort). Fall back to Vite's default when running `npm run dev` manually.
  const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
  return {
    plugins: [react()],
    server: envPort
      ? { port: envPort, strictPort: true }
      : { port: 5173 },
  };
});
