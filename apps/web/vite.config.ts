import { execFileSync } from 'node:child_process';
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

/** Resolve the short git commit hash at build time for the About screen's
 *  `build` row. Best-effort — falls back to `'dev'` when `git` isn't on PATH
 *  or the current dir isn't a working tree, so CI sandboxes never break.
 *  Uses execFileSync (no shell) so there is no injection surface. */
function resolveGitHash(): string {
  const envHash = process.env.GIT_COMMIT_HASH;
  if (envHash) return envHash.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwind()],
  define: {
    __MOEKODER_BUILD_HASH__: JSON.stringify(resolveGitHash()),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@moekoder/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    // Electron 41 ships Chromium 134 — ES2022 covers everything we use and
    // skips legacy transforms (optional chaining, nullish coalescing, etc.).
    target: 'es2022',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules/')) return;
          if (/\/(react|react-dom|use-sync-external-store)\//.test(id)) return 'vendor-react';
          if (id.includes('/zustand/')) return 'vendor-zustand';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
        },
      },
    },
  },
  server: { port: VITE_DEV_PORT, strictPort: true },
});
