/**
 * Renderer-side platform flags. Derived from `navigator.userAgent` because
 * the preload bridge doesn't currently expose `process.platform`. Evaluated
 * once at module load — the UA doesn't change at runtime.
 *
 * Used by chrome layers (Titlebar, OnboardingLayout) to:
 *   · hide our custom min/max/close buttons on macOS (native traffic lights
 *     are already rendered by Electron when `titleBarStyle: 'hidden'`),
 *   · reserve horizontal space on the left edge so the brand doesn't sit
 *     underneath the traffic lights.
 */
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const IS_MAC = /Macintosh|Mac OS X/i.test(ua);
export const IS_WINDOWS = /Windows/i.test(ua);
export const IS_LINUX = !IS_MAC && !IS_WINDOWS && /Linux|X11/i.test(ua);
