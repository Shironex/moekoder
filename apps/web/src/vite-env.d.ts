/// <reference types="vite/client" />

/**
 * Ambient declarations for build-time constants wired into the bundle via
 * Vite's `define` option (see `vite.config.ts`). Each entry here is replaced
 * at build time with a string literal — this file only tells TypeScript the
 * identifier exists at the type level.
 */

/**
 * Short git commit hash for the currently-built bundle, or `'dev'` when the
 * build host couldn't resolve one. Consumed by the About screen's version
 * block.
 */
declare const __MOEKODER_BUILD_HASH__: string;
