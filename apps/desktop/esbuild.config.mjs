import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';
import path from 'node:path';

// Bundle everything except `electron` itself. Several of our deps
// (electron-store@10, electron-updater@6, electron-log@5) ship ESM-only,
// which Electron's CJS main cannot `require()` at runtime. Letting esbuild
// bundle them resolves the ESM→CJS interop at build time. Workspace deps
// (e.g. @moekoder/shared) bundle through naturally.
const external = ['electron'];

await build({
  entryPoints: ['src/main/index.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/main',
  sourcemap: true,
  external,
  logLevel: 'info',
});

// Phase 1 placeholder shell — copied straight through until the renderer takes over.
copyFileSync(path.resolve('src/main/shell.html'), path.resolve('dist/main/shell.html'));
console.log('[esbuild] copied shell.html -> dist/main/shell.html');
