import type { ThemeId } from '@moekoder/shared';
import { logger } from '@/lib/logger';

const log = logger('theme');

/**
 * Flip the active theme on `<html>`. DOM-only — the CSS token blocks in
 * `styles/tokens.css` key off `data-theme`, so the visual swap happens
 * synchronously as soon as the attribute changes.
 *
 * This is deliberately *not* a persistence operation: boot-time renders
 * call `applyTheme(defaultThemeId)` before the async `useSetting` fetch
 * resolves, and persisting at that moment would clobber the user's saved
 * choice before we get a chance to read it. Persistence lives in
 * `persistTheme` and is called at explicit user-action callsites only
 * (onboarding Theme step, Settings).
 */
export const applyTheme = (id: ThemeId): void => {
  document.documentElement.setAttribute('data-theme', id);
};

/**
 * Persist the selected theme id to electron-store via the preload bridge.
 * Swallows errors from a pure-browser preview (no Electron bridge) so a
 * missing IPC surface doesn't break the visual swap in dev.
 */
export const persistTheme = async (id: ThemeId): Promise<void> => {
  try {
    await window.electronAPI?.store.set('themeId', id);
  } catch (err) {
    log.warn('could not persist to electron-store', err);
  }
};
