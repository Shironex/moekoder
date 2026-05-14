import { defineConfig } from 'vitest/config';

// Defensive config for vitest 4: the default exclude was simplified to just
// node_modules + .git. Pinning include to src keeps discovery explicit and
// matches the apps/web convention.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
