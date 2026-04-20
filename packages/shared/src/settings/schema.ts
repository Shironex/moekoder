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
 * Hardware-encoder choice picked in onboarding. The renderer persists the
 * user's intent verbatim; the encode pipeline maps `amf` + `cpu` onto the
 * backend's `libx264` path for v0.1 since AMF isn't wired and "cpu" is our
 * name for the software encoder.
 */
export type HwChoice = 'nvenc' | 'qsv' | 'amf' | 'cpu';

/**
 * Encoding preset picked in onboarding. v0.1 translates these to `cq` +
 * NVENC preset tuples at encode-start time; a richer preset editor lands
 * in v0.4 per the roadmap.
 */
export type PresetChoice = 'fast' | 'balanced' | 'pristine';

/**
 * Output container picked in onboarding. The backend fully supports mp4
 * and mkv; `webm` is allowed in the UI so Onboarding matches the
 * aspirational lineup, but the encode pipeline falls it back to mp4 for
 * v0.1 (AV1/VP9 support lands in v0.4).
 */
export type ContainerChoice = 'mp4' | 'mkv' | 'webm';

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
  /** Hardware encoder chosen in onboarding (mapped at encode start). */
  hwChoice: HwChoice;
  /** Encoding preset chosen in onboarding (mapped at encode start). */
  preset: PresetChoice;
  /** Output container chosen in onboarding. */
  container: ContainerChoice;
  /** Whether the pipeline sidebar is collapsed to the kanji rail. */
  sidebarCollapsed: boolean;
}

export const USER_SETTINGS_DEFAULTS: UserSettings = {
  hasCompletedOnboarding: false,
  themeId: 'plum',
  saveTarget: 'moekoder',
  customSavePath: null,
  hwChoice: 'cpu',
  preset: 'balanced',
  container: 'mp4',
  sidebarCollapsed: false,
};

export type UserSettingsKey = keyof UserSettings;
