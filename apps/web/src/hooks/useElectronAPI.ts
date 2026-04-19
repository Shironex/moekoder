import type { ElectronAPI } from '@/types/electron-api';

/**
 * Runtime accessor for the preload bridge. Throws a loud error if the bridge
 * is missing — Moekoder's renderer is only supposed to run inside Electron,
 * so a missing `window.electronAPI` means the preload never ran, which is
 * worth failing fast for.
 *
 * Not a true React hook (no state, no subscriptions) but namespaced `use*`
 * for call-site consistency with the rest of `src/hooks/`.
 */
export const useElectronAPI = (): ElectronAPI => {
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('electronAPI not available — Moekoder must run inside Electron');
  }
  return window.electronAPI;
};
