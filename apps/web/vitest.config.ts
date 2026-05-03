import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Renderer-side vitest config. The current suite covers pure helpers only
 * (`drop-helpers.test.ts`) so a Node environment is enough; if a future
 * test needs the DOM, switch to `jsdom` and add the dep then.
 *
 * The `@` alias mirrors `vite.config.ts` so test files can use the same
 * import paths as production code without dragging the React/Tailwind
 * plugins into the test runner.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@moekoder/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
