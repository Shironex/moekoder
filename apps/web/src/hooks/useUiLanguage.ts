import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UI_LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  type SupportedLanguage,
} from '@moekoder/shared';
import { useElectronAPI } from './useElectronAPI';
import { logger } from '@/lib/logger';

const log = logger('uiLanguage');

/** Best-effort localStorage write for the synchronous-boot mirror. */
function mirrorToLocalStorage(lang: SupportedLanguage): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Private-mode / quota — the electron-store copy is the durable one.
  }
}

/**
 * Reactive UI-language binding for switchers. `language` re-renders the
 * consumer whenever the active language changes (via react-i18next's
 * subscription). `setLanguage` applies the change everywhere it needs to
 * land: the live i18next instance, the localStorage boot mirror, and the
 * durable `uiLanguage` setting in electron-store.
 *
 * Pure setter — it does NOT hydrate. Hydration happens once at app mount via
 * {@link useUiLanguageSync}; mounting the sync logic here too would re-fire it
 * per picker instance.
 */
export const useUiLanguage = (): {
  language: string;
  setLanguage: (lang: SupportedLanguage) => void;
} => {
  const { i18n } = useTranslation();
  const api = useElectronAPI();

  const setLanguage = useCallback(
    (lang: SupportedLanguage): void => {
      void i18n.changeLanguage(lang);
      mirrorToLocalStorage(lang);
      api.store.set('uiLanguage', lang).catch(err => log.warn('persist uiLanguage failed', err));
    },
    [i18n, api]
  );

  return { language: i18n.language, setLanguage };
};

/**
 * One-shot reconciliation of the live i18next language with the durable
 * `uiLanguage` setting in electron-store. Mount exactly once (in `App`).
 *
 *   · Stored value is a real language → apply it if it differs from the
 *     synchronously-detected boot language (covers a cleared localStorage
 *     mirror, or a value written on another machine via a synced store).
 *   · Stored value is `null` (first run, never chosen) → persist the
 *     boot-detected language so the OS-locale detection result becomes the
 *     durable, sticky choice and future boots skip re-detection.
 *
 * The read is async (IPC), so this gates on completion rather than on a
 * nullable sentinel — `null` is a legitimate stored value here, not "loading".
 */
export const useUiLanguageSync = (): void => {
  const { i18n } = useTranslation();
  const api = useElectronAPI();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      try {
        const stored = await api.store.get('uiLanguage');
        const current = i18n.language;
        if (stored == null) {
          if (isSupportedLanguage(current)) {
            mirrorToLocalStorage(current);
            api.store
              .set('uiLanguage', current)
              .catch(err => log.warn('persist detected uiLanguage failed', err));
          }
          return;
        }
        if (isSupportedLanguage(stored) && stored !== current) {
          await i18n.changeLanguage(stored);
          mirrorToLocalStorage(stored);
        }
      } catch (err) {
        log.warn('uiLanguage hydration failed', err);
      }
    })();
  }, [api, i18n]);
};
