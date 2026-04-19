import { build } from 'esbuild';
import { readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Externalize runtime deps; bundle workspace packages so the packaged main
// doesn't carry workspace-protocol references.
const external = [
  'electron',
  ...Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@moekoder/')),
];

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
