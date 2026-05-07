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
  /** Whether the app runs background update checks. Default `false` per the
   *  onboarding Privacy pledge — users must opt in from Settings → Updates. */
  autoCheckUpdates: boolean;
  /** How many encodes the queue may run in parallel. Clamped 1..4 by the
   *  queue manager's zod schema; default 1 mirrors the Single-route guarantee. */
  queueConcurrency: 1 | 2 | 3 | 4;
  /** Per-item retry budget. After this many additional attempts the queue
   *  marks the item `error` and moves on. Default 2 (so 3 total tries). */
  queueMaxRetries: number;
  /** Base backoff between retries, in milliseconds. The queue waits
   *  `queueBackoffMs * 2^attempts` so attempt 2 waits 4s, attempt 3 waits 8s,
   *  etc. */
  queueBackoffMs: number;
  /** Which screen the app boots into. `'single'` keeps the v0.2 default;
   *  power-users can flip to `'queue'` so the app opens straight into the
   *  batch screen. */
  queueDefaultRoute: 'single' | 'queue';
  /** Fire a desktop notification when the queue drains (running → empty,
   *  not paused, not cancelled). Opt-out for users who hate toast popups. */
  queueNotifyOnComplete: boolean;
  /**
   * Persisted full encoding profile picked from Settings → Encoding. v0.4
   * supersedes the per-axis onboarding-derived `hwChoice` / `preset` /
   * `container` keys with this single blob — the legacy keys are still
   * read at boot for users coming from v0.3 and earlier, but the new
   * Encoding section writes here directly.
   *
   * Loose record so the renderer doesn't import the desktop's
   * `EncodingSettings` discriminated union (the renderer bundle never
   * pulls main-process modules).
   */
  encoding: EncodingProfile;
  /**
   * Custom presets the user has saved from the Encoding section. Each
   * entry carries a `version: 1` field so a future shape migration is
   * tractable; v0.4 only ever writes version 1.
   */
  customPresets: CustomPreset[];
}

/**
 * Renderer-facing mirror of the desktop's `EncodingSettings` discriminated
 * union. The wire boundary (electron-store + IPC) revalidates the shape
 * loosely — the typed union lives in `apps/desktop/src/main/ffmpeg/settings.ts`
 * and the renderer reflects only the fields it needs to read for the
 * Encoding section UI. Storing as a raw record avoids the
 * `Partial<DiscriminatedUnion>` pitfalls when serializing/deserializing.
 */
export type EncodingProfile = Record<string, unknown>;

/**
 * One custom preset — a named encoding profile the user can quick-apply
 * from the Encoding section. `version: 1` is mandatory from day one so
 * future shape changes can migrate cleanly without dropping saved data.
 */
export interface CustomPreset {
  /** Schema version. v0.4 only writes 1. Bump on breaking shape changes. */
  version: 1;
  /** Stable id (`crypto.randomUUID()`), used as the React key + delete target. */
  id: string;
  /** User-supplied display name. Trimmed at edit time; capped at 40 chars. */
  name: string;
  /** `Date.now()` at save time. Older entries surface first in the list. */
  createdAt: number;
  /** Full encoding profile snapshot. */
  settings: EncodingProfile;
}

/**
 * Default encoding profile — H.264 NVENC Balanced. Mirrors
 * `H264_BALANCED_PRESET` in `apps/desktop/src/main/ffmpeg/settings.ts`.
 * The renderer overwrites this on the first save from the new Encoding
 * section; users coming from v0.3 still get the H.264 defaults until they
 * open the section.
 */
const DEFAULT_ENCODING_PROFILE: EncodingProfile = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 19,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};

export const USER_SETTINGS_DEFAULTS: UserSettings = {
  hasCompletedOnboarding: false,
  themeId: 'plum',
  saveTarget: 'moekoder',
  customSavePath: null,
  hwChoice: 'cpu',
  preset: 'balanced',
  container: 'mp4',
  sidebarCollapsed: false,
  autoCheckUpdates: false,
  queueConcurrency: 1,
  queueMaxRetries: 2,
  queueBackoffMs: 4000,
  queueDefaultRoute: 'single',
  queueNotifyOnComplete: true,
  encoding: DEFAULT_ENCODING_PROFILE,
  customPresets: [],
};

export type UserSettingsKey = keyof UserSettings;
