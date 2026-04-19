import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

/** Keep in sync with packages/shared/src/constants/app.ts `VITE_DEV_PORT`.
 *  Hardcoded here because vite's config loader evaluates this file with
 *  Node's strict ESM resolver, which can't follow the workspace's
 *  extensionless TS re-exports. Runtime imports from `src/` go through
 *  the alias below and resolve fine. */
const VITE_DEV_PORT = 15180;

export default defineConfig({
  base: './',
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@moekoder/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: { port: VITE_DEV_PORT, strictPort: true },
});
