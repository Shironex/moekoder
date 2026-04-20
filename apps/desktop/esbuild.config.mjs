import { build } from 'esbuild';

// Bundle everything except `electron` itself. Several of our deps
// (electron-store, electron-updater, electron-log) ship ESM-only, which
// Electron's CJS main cannot `require()` at runtime. Letting esbuild bundle
// them resolves the ESM→CJS interop at build time. Workspace deps
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
