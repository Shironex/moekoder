import type { ThemeId } from '@moekoder/shared';

/**
 * Set the active theme on the document root and persist the selection.
 *
 * The CSS token blocks in `styles/tokens.css` key off `data-theme`, so all of
 * the visual swap happens synchronously as soon as the attribute flips. The
 * persistence hop is async and swallows electron-store errors — a pure browser
 * preview (vite dev without electron) does not have the IPC bridge available,
 * and we don't want that to break the in-memory theme switch.
 */
export const applyTheme = async (id: ThemeId): Promise<void> => {
  document.documentElement.setAttribute('data-theme', id);
  try {
    await window.electronAPI?.store.set('themeId', id);
  } catch (err) {
    // Electron may not be available in a pure-browser preview — swallow.
    console.warn('[applyTheme] could not persist to electron-store', err);
  }
};
