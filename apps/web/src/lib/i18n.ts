/**
 * Renderer i18next setup. Imported once for its side effect from `main.tsx`
 * *before* React renders, so `t()` is ready on the very first paint.
 *
 * Resources are bundled at build time (static JSON imports below) — there is
 * no async loader, so init is synchronous and there is no flash of untranslated
 * keys. The chosen language is decided synchronously by {@link getInitialLanguage}
 * (localStorage mirror → OS-locale detection → `en`); the durable source of
 * truth lives in `electron-store` and is reconciled once at mount by
 * `useUiLanguageSync` (see `@/hooks/useUiLanguage`).
 *
 * Shared language primitives (`SUPPORTED_LANGUAGES`, `SupportedLanguage`,
 * `isSupportedLanguage`, `pickInitialLanguage`, `UI_LANGUAGE_STORAGE_KEY`)
 * live in `@moekoder/shared/i18n` so the settings schema and the main process
 * agree with the renderer on what languages exist.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { FALLBACK_LANGUAGE, UI_LANGUAGE_STORAGE_KEY, pickInitialLanguage } from '@moekoder/shared';

import aboutEn from '@/locales/en/about.json';
import commonEn from '@/locales/en/common.json';
import crashEn from '@/locales/en/crash.json';
import doneEn from '@/locales/en/done.json';
import encodingEn from '@/locales/en/encoding.json';
import extractEn from '@/locales/en/extract.json';
import idleEn from '@/locales/en/idle.json';
import onboardingEn from '@/locales/en/onboarding.json';
import queueEn from '@/locales/en/queue.json';
import settingsEn from '@/locales/en/settings.json';
import sidebarEn from '@/locales/en/sidebar.json';
import splashEn from '@/locales/en/splash.json';
import titlebarEn from '@/locales/en/titlebar.json';
import updaterEn from '@/locales/en/updater.json';

import aboutPl from '@/locales/pl/about.json';
import commonPl from '@/locales/pl/common.json';
import crashPl from '@/locales/pl/crash.json';
import donePl from '@/locales/pl/done.json';
import encodingPl from '@/locales/pl/encoding.json';
import extractPl from '@/locales/pl/extract.json';
import idlePl from '@/locales/pl/idle.json';
import onboardingPl from '@/locales/pl/onboarding.json';
import queuePl from '@/locales/pl/queue.json';
import settingsPl from '@/locales/pl/settings.json';
import sidebarPl from '@/locales/pl/sidebar.json';
import splashPl from '@/locales/pl/splash.json';
import titlebarPl from '@/locales/pl/titlebar.json';
import updaterPl from '@/locales/pl/updater.json';

/**
 * Every namespace MoeKoder ships. `defaultNS` is `common`; components opt into
 * a namespace with `useTranslation('<ns>')`. Add a namespace here and create
 * its `en`/`pl` JSON under `src/locales/`.
 */
export const NAMESPACES = [
  'common',
  'titlebar',
  'sidebar',
  'idle',
  'encoding',
  'done',
  'queue',
  'settings',
  'about',
  'onboarding',
  'extract',
  'updater',
  'crash',
  'splash',
] as const;

const resources = {
  en: {
    common: commonEn,
    titlebar: titlebarEn,
    sidebar: sidebarEn,
    idle: idleEn,
    encoding: encodingEn,
    done: doneEn,
    queue: queueEn,
    settings: settingsEn,
    about: aboutEn,
    onboarding: onboardingEn,
    extract: extractEn,
    updater: updaterEn,
    crash: crashEn,
    splash: splashEn,
  },
  pl: {
    common: commonPl,
    titlebar: titlebarPl,
    sidebar: sidebarPl,
    idle: idlePl,
    encoding: encodingPl,
    done: donePl,
    queue: queuePl,
    settings: settingsPl,
    about: aboutPl,
    onboarding: onboardingPl,
    extract: extractPl,
    updater: updaterPl,
    crash: crashPl,
    splash: splashPl,
  },
} as const;

/**
 * Synchronous initial-language pick. Reads the localStorage mirror and the
 * navigator locale (both available before React mounts) and delegates the
 * decision to the shared {@link pickInitialLanguage}. Guarded for non-DOM
 * contexts (tests, SSR) where `localStorage` / `navigator` are absent.
 */
function getInitialLanguage(): string {
  const stored =
    typeof localStorage !== 'undefined' ? localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) : null;
  const navLang = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return pickInitialLanguage(stored, navLang);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  ns: NAMESPACES as unknown as string[],
  defaultNS: 'common',
  interpolation: {
    // React already escapes interpolated values, so i18next must not.
    escapeValue: false,
  },
});

export default i18n;
