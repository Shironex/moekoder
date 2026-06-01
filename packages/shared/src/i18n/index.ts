/**
 * Shared UI-language primitives. Lives in `@moekoder/shared` so the settings
 * schema, the renderer's i18next setup, and the main-process notification
 * strings all agree on one source of truth for which languages exist and how
 * the initial language is chosen.
 *
 * This module is intentionally framework-free — no i18next, no React. The
 * renderer's `src/lib/i18n.ts` builds the i18next instance on top of these
 * primitives; the main process reads {@link isSupportedLanguage} to localize
 * the handful of strings it emits outside the renderer (see
 * `apps/desktop/src/main/i18n.ts`).
 */

/**
 * Every UI language MoeKoder ships. `label` is the endonym (the language's
 * own name) and is shown verbatim in the picker regardless of the active
 * language — that's the convention switchers use so a lost user can always
 * find their language. Add a new entry here and the picker, the settings
 * schema union, and the type guard all pick it up.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
] as const;

/** Union of the supported language codes — `'en' | 'pl'`. */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

/** Default / fallback language for any missing key or unrecognised input. */
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

/**
 * localStorage key holding the renderer's synchronous boot copy of the
 * chosen language. The durable source of truth is the `uiLanguage` field in
 * `electron-store` (see the settings schema); this mirror exists only so the
 * very first synchronous render picks the right language with no IPC
 * round-trip and no flash of the wrong language on the splash screen.
 */
export const UI_LANGUAGE_STORAGE_KEY = 'moekoder.uiLanguage';

/** Narrowing guard — `true` only for a code in {@link SUPPORTED_LANGUAGES}. */
export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some(lang => lang.code === value);
}

/**
 * Decide the initial UI language from the two synchronous signals available
 * at boot. Pure so it can be unit-tested without a DOM:
 *
 *   1. An explicit, previously-persisted choice (localStorage mirror) wins.
 *   2. Otherwise auto-detect: a Polish OS/browser locale → `pl`.
 *   3. Otherwise the fallback (`en`).
 *
 * @param stored  raw localStorage value (may be `null` / unrecognised)
 * @param navLang `navigator.language` (e.g. `"pl-PL"`, `"en-US"`, or undefined)
 */
export function pickInitialLanguage(
  stored: string | null | undefined,
  navLang: string | null | undefined
): SupportedLanguage {
  if (isSupportedLanguage(stored)) return stored;
  if (typeof navLang === 'string' && navLang.toLowerCase().startsWith('pl')) return 'pl';
  return FALLBACK_LANGUAGE;
}
