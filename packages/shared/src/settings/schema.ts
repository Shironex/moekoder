import type { ThemeId } from '../themes/types';

/**
 * Where the encoder should drop its output by default. Set in the onboarding
 * Save step and consumed at runtime when the user picks a video — the output
 * directory is derived relative to the source (or `customSavePath`).
 *
 *   · `moekoder` → sibling `moekoder/` subfolder next to the source video
 *   · `same`     → same folder as the source video
 *   · `subbed`   → `customSavePath` if set, else sibling `subbed/` subfolder
 *   · `custom`   → `customSavePath`; falls back to the source folder if unset
 */
export type SaveTarget = 'moekoder' | 'same' | 'subbed' | 'custom';

/**
 * Persisted user settings shape, owned by the main process via
 * `electron-store` and mirrored through the `store:*` IPC channels.
 *
 * Keep every field strongly typed here — the preload bridge infers the
 * renderer-visible store API from this interface (see
 * `apps/desktop/src/main/preload.ts`).
 */
export interface UserSettings {
  /** Has the user completed the first-run onboarding flow? */
  hasCompletedOnboarding: boolean;
  /** Currently selected theme id. */
  themeId: ThemeId;
  /** Where the encoder writes output by default — chosen in onboarding. */
  saveTarget: SaveTarget;
  /** Absolute folder path used when `saveTarget` is `'custom'` (or `'subbed'`
   *  if the user pointed it at a dedicated root). `null` when unset. */
  customSavePath: string | null;
  /** Most recent folder used as an output target. */
  lastOutputDir: string | null;
  /** Encoding preset last chosen (v0.1 ships Balanced only). */
  lastPreset: 'balanced';
}

export const USER_SETTINGS_DEFAULTS: UserSettings = {
  hasCompletedOnboarding: false,
  themeId: 'midnight',
  saveTarget: 'moekoder',
  customSavePath: null,
  lastOutputDir: null,
  lastPreset: 'balanced',
};

export type UserSettingsKey = keyof UserSettings;
