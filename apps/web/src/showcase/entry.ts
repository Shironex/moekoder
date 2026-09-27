/**
 * Showcase build only (`vite build --mode showcase`, see vite.config.ts).
 *
 * `useElectronAPI` throws when `window.electronAPI` is missing, so the fake
 * has to exist before any app module runs. vite.config.ts loads this file as
 * its own module script ahead of `src/main.tsx`, and it imports nothing from
 * the app itself, so the install below always runs first.
 */
import { createFakeElectronApi, type ShowcaseControls } from './fake-electron-api';

declare global {
  interface Window {
    /** Showcase build only: lets the capture play encode events. */
    __moekoderShowcase?: ShowcaseControls;
  }
}

const { api, controls } = createFakeElectronApi();
window.electronAPI = api;
window.__moekoderShowcase = controls;
