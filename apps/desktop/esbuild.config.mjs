import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';

// Bundle everything except `electron` itself. Several of our deps
// (electron-store, electron-updater) ship ESM-only, which Electron's CJS
// main cannot `require()` at runtime. Letting esbuild bundle them resolves
// the ESM→CJS interop at build time. Workspace deps (e.g. @moekoder/shared)
// bundle through naturally.
const external = ['electron'];

const result = await build({
  entryPoints: ['src/main/index.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/main',
  sourcemap: true,
  // esbuild tree-shakes ESM by default, but CJS output still needs the
  // explicit flag to drop unused exports from bundled deps.
  minify: true,
  treeShaking: true,
  // metafile lands alongside the bundle so we can run
  // `npx esbuild-visualizer --metadata dist/main/meta.json` or paste the
  // JSON into https://esbuild.github.io/analyze/ to audit bundle growth.
  metafile: true,
  external,
  logLevel: 'info',
});

writeFileSync('dist/main/meta.json', JSON.stringify(result.metafile));
