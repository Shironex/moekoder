import { isSupportedLanguage, type SupportedLanguage } from '@moekoder/shared';
import { getSetting } from './store';

/**
 * Main-process string localization.
 *
 * The renderer owns the real i18n surface (i18next + `src/locales/`); this is
 * a deliberately tiny, hand-rolled table for the *handful* of user-facing
 * strings the main process emits outside the renderer — currently just the
 * queue-complete desktop notification. The main process can't reach the
 * renderer's i18next instance, but it can read the persisted `uiLanguage`
 * synchronously from electron-store, which is all this needs.
 *
 * Keep this small. Anything that can be rendered in React belongs in the
 * renderer's locale JSON, not here.
 */

interface MainMessages {
  queueCompleteTitle: string;
  /** Body of the queue-complete notification. `count` = number of finished items. */
  queueCompleteBody: (count: number) => string;
}

/**
 * Polish plural category for the noun "plik" (file):
 *   1            → "plik"
 *   2–4 (×)      → "pliki"   (excluding 12–14)
 *   0, 5+, 12–14 → "plików"
 * Mirrors the CLDR `one` / `few` / `many` rule i18next applies in the renderer.
 */
function plPliki(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return 'plik';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'pliki';
  return 'plików';
}

const MESSAGES: Record<SupportedLanguage, MainMessages> = {
  en: {
    queueCompleteTitle: 'Queue complete',
    queueCompleteBody: count => `${count} file${count === 1 ? '' : 's'} done.`,
  },
  pl: {
    queueCompleteTitle: 'Kolejka ukończona',
    queueCompleteBody: count => `Ukończono ${count} ${plPliki(count)}.`,
  },
};

/**
 * Resolve the main-process message table for the user's current UI language,
 * read synchronously from electron-store. Falls back to English for an unset
 * (`null`, first-run) or unrecognised value.
 */
export function mainMessages(): MainMessages {
  const lang = getSetting('uiLanguage');
  return MESSAGES[isSupportedLanguage(lang) ? lang : 'en'];
}
