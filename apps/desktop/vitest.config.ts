import { defineConfig } from 'vitest/config';

// Defensive config for v4: vitest 4 simplified the default exclude
// pattern to just node_modules + .git, which means a future build
// artefact dropped into apps/desktop/<dir>/ could be picked up as a
// test source. Pinning include to src/**/*.test.ts keeps discovery
// explicit and matches the apps/web convention.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
