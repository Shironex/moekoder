import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

// Externalize every runtime dep except workspace packages (@moekoder/*).
// electron-builder copies them from node_modules into the asar at package
// time based on apps/desktop/package.json's `dependencies`. This keeps the
// main bundle small (parse/eval cost on cold start) and avoids shipping a
// second, bundled copy of each dep alongside the node_modules one.
//
// Prerequisite: every externalized dep must be CJS-resolvable at runtime.
// electron-store is pinned to ^8.2.0 (last CJS release) so `require()`
// works from Electron's CJS main; v9+ is ESM-only.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = [
  'electron',
  ...Object.keys(pkg.dependencies ?? {}).filter(d => !d.startsWith('@moekoder/')),
];

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
