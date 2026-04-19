import type { ThemeId } from '../themes/types';

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
  /** Most recent folder used as an output target. */
  lastOutputDir: string | null;
  /** Encoding preset last chosen (v0.1 ships Balanced only). */
  lastPreset: 'balanced';
}

export const USER_SETTINGS_DEFAULTS: UserSettings = {
  hasCompletedOnboarding: false,
  themeId: 'midnight',
  lastOutputDir: null,
  lastPreset: 'balanced',
};

export type UserSettingsKey = keyof UserSettings;
