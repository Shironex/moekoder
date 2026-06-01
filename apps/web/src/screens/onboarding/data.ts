/**
 * Static content for the first-run onboarding wizard. Ported verbatim from
 * the design prototype's `onboarding-data.jsx`. No React, no runtime state —
 * just the registries the step components read.
 */
import type { InstallStage } from '@/types/electron-api';

// ---------------------------------------------------------------------------
// Step registry — the 9-step flow.
// ---------------------------------------------------------------------------

export type OnboardingStepId =
  | 'welcome'
  | 'engine'
  | 'hw'
  | 'theme'
  | 'preset'
  | 'save'
  | 'cont'
  | 'privacy'
  | 'done';

export interface OnboardingStepMeta {
  id: OnboardingStepId;
  /** Japanese numeral indicator — 壱 弐 参 肆 伍 陸 漆 捌 玖. */
  n: string;
  /** Single-kanji sigil for the step. */
  kanji: string;
  /** i18n key for the step label shown in the rail. */
  labelKey: string;
  /** Mono subtitle like "ffmpeg · 引擎" — decorative, left inline. */
  mono: string;
  /** Whether the step exposes a "Skip for now" footer affordance. */
  skippable: boolean;
}

// Theme comes first after Welcome so the user dresses the wizard in the
// look they want *before* sitting through the ffmpeg download on Engine —
// the 180 MB fetch feels shorter against your own palette. Engine + Hardware
// still run ffmpeg/GPU probes on mount, so shifting them right doesn't
// change the timing of either IPC roundtrip.
export const OB_STEPS: readonly OnboardingStepMeta[] = [
  {
    id: 'welcome',
    n: '壱',
    kanji: '迎',
    labelKey: 'steps.welcome',
    mono: 'intro · 挨拶',
    skippable: false,
  },
  {
    id: 'theme',
    n: '弐',
    kanji: '色',
    labelKey: 'steps.theme',
    mono: 'look · 色',
    skippable: true,
  },
  {
    id: 'engine',
    n: '参',
    kanji: '引',
    labelKey: 'steps.engine',
    mono: 'ffmpeg · 引擎',
    skippable: false,
  },
  { id: 'hw', n: '肆', kanji: '核', labelKey: 'steps.hw', mono: 'gpu · 核', skippable: false },
  {
    id: 'preset',
    n: '伍',
    kanji: '設',
    labelKey: 'steps.preset',
    mono: 'quality · 設',
    skippable: true,
  },
  {
    id: 'save',
    n: '陸',
    kanji: '箱',
    labelKey: 'steps.save',
    mono: 'output · 保存',
    skippable: true,
  },
  {
    id: 'cont',
    n: '漆',
    kanji: '器',
    labelKey: 'steps.cont',
    mono: 'format · 器',
    skippable: true,
  },
  {
    id: 'privacy',
    n: '捌',
    kanji: '静',
    labelKey: 'steps.privacy',
    mono: 'quiet · 静',
    skippable: false,
  },
  {
    id: 'done',
    n: '玖',
    kanji: '始',
    labelKey: 'steps.done',
    mono: 'finish · 始',
    skippable: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Engine step — ffmpeg + ffprobe download substages.
// ---------------------------------------------------------------------------

export interface DlStage {
  id: 'resolve' | 'ffmpeg' | 'ffprobe' | 'verify' | 'install';
  /** Kanji glyph shown inside the stage node. */
  k: string;
  /** i18n key for the stage label. */
  labelKey: string;
  /** i18n key for the sub/secondary label. */
  subKey: string;
  /** Approximate download size in megabytes. `null` for non-network stages. */
  size: number | null;
}

export const DL_STAGES: readonly DlStage[] = [
  { id: 'resolve', k: '尋', labelKey: 'dl.resolve.label', subKey: 'dl.resolve.sub', size: null },
  { id: 'ffmpeg', k: '録', labelKey: 'dl.ffmpeg.label', subKey: 'dl.ffmpeg.sub', size: 88.4 },
  { id: 'ffprobe', k: '測', labelKey: 'dl.ffprobe.label', subKey: 'dl.ffprobe.sub', size: 88.1 },
  { id: 'verify', k: '印', labelKey: 'dl.verify.label', subKey: 'dl.verify.sub', size: null },
  {
    id: 'install',
    k: '置',
    labelKey: 'dl.install.label',
    subKey: 'dl.install.sub',
    size: null,
  },
] as const;

/**
 * Map an upstream `InstallStage` onto the visual-stage registry above. Two
 * upstream stages (`downloading`, `extracting`) cover both ffmpeg + ffprobe
 * visual stages, so callers overlay download progress across them based on
 * byte counters; this helper gives the first "active" stage for any upstream
 * value.
 */
export const DL_STAGE_FOR_UPSTREAM: Record<InstallStage, DlStage['id']> = {
  resolving: 'resolve',
  downloading: 'ffmpeg',
  verifying: 'verify',
  extracting: 'install',
  installing: 'install',
  done: 'install',
};

// ---------------------------------------------------------------------------
// Hardware step — detected encoder options.
// ---------------------------------------------------------------------------

export type HwOptionId = 'nvenc' | 'qsv' | 'amf' | 'cpu';

export interface HwOption {
  id: HwOptionId;
  k: string;
  name: string;
  /** Chip / device label — filled by the probe at runtime when possible. */
  chip: string;
  mono: string;
  specs: ReadonlyArray<readonly [string, string]>;
  detected: boolean;
  primary?: boolean;
}

/**
 * Default template applied before the runtime probe fires. `detected` flags
 * are overwritten by {@link mergeHwOptions} once `electronAPI.gpu.probe()`
 * resolves — CPU stays detected regardless.
 */
export const HW_OPTIONS_TEMPLATE: readonly HwOption[] = [
  {
    id: 'nvenc',
    k: '核',
    name: 'NVIDIA NVENC',
    chip: 'GeForce · detect pending',
    mono: 'gpu · cuda',
    specs: [
      ['Encoder', 'h264_nvenc · hevc_nvenc'],
      ['Throughput', '≈ 9× realtime at p4'],
    ],
    detected: false,
  },
  {
    id: 'qsv',
    k: '速',
    name: 'Intel Quick Sync',
    chip: 'iGPU · detect pending',
    mono: 'gpu · quicksync',
    specs: [
      ['Encoder', 'h264_qsv · hevc_qsv'],
      ['Throughput', '≈ 7× realtime'],
    ],
    detected: false,
  },
  {
    id: 'amf',
    k: '赤',
    name: 'AMD AMF',
    chip: 'Radeon · detect pending',
    mono: 'gpu · amf',
    specs: [
      ['Encoder', 'h264_amf · hevc_amf'],
      ['Throughput', '≈ 6× realtime'],
    ],
    detected: false,
  },
  {
    id: 'cpu',
    k: '脳',
    name: 'CPU · libx264',
    chip: 'software · always available',
    mono: 'software · always',
    specs: [
      ['Encoder', 'libx264'],
      ['Throughput', '≈ 1.2× realtime'],
    ],
    detected: true,
  },
] as const;

// ---------------------------------------------------------------------------
// Preset step — default-preset picker.
// ---------------------------------------------------------------------------

export type ObPresetId = 'fast' | 'balanced' | 'pristine';

export interface ObPreset {
  id: ObPresetId;
  k: string;
  /** i18n key for the display name. */
  nameKey: string;
  /** i18n key for the hint text. */
  hintKey: string;
  specs: ReadonlyArray<readonly [string, string]>;
}

export const OB_PRESETS: readonly ObPreset[] = [
  {
    id: 'fast',
    k: '速',
    nameKey: 'preset.fast.name',
    hintKey: 'preset.fast.hint',
    specs: [
      ['ffmpeg', 'p2'],
      ['cq', '23'],
      ['speed', '12×'],
    ],
  },
  {
    id: 'balanced',
    k: '均',
    nameKey: 'preset.balanced.name',
    hintKey: 'preset.balanced.hint',
    specs: [
      ['ffmpeg', 'p4'],
      ['cq', '19'],
      ['speed', '6×'],
    ],
  },
  {
    id: 'pristine',
    k: '極',
    nameKey: 'preset.pristine.name',
    hintKey: 'preset.pristine.hint',
    specs: [
      ['ffmpeg', 'p7'],
      ['cq', '16'],
      ['speed', '2×'],
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Save-target step.
// ---------------------------------------------------------------------------

export type ObSaveId = 'moekoder' | 'same' | 'subbed' | 'custom';

export interface ObSave {
  id: ObSaveId;
  k: string;
  /** i18n key for the label. */
  labelKey: string;
  /** Example path string — `null` for the custom option (user picks). */
  path: string | null;
}

export const OB_SAVES: readonly ObSave[] = [
  {
    id: 'moekoder',
    k: '隣',
    labelKey: 'save.moekoder.label',
    path: '<source-folder>/moekoder/',
  },
  {
    id: 'same',
    k: '同',
    labelKey: 'save.same.label',
    path: '<source-folder>/',
  },
  {
    id: 'subbed',
    k: '済',
    labelKey: 'save.subbed.label',
    path: '<source-folder>/subbed/',
  },
  {
    id: 'custom',
    k: '択',
    labelKey: 'save.custom.label',
    path: null,
  },
] as const;

// ---------------------------------------------------------------------------
// Container step.
// ---------------------------------------------------------------------------

export type ObContainerExt = 'mp4' | 'mkv' | 'webm';

export interface ObContainer {
  ext: ObContainerExt;
  name: string;
  /** i18n key for the blurb text. */
  blurbKey: string;
}

export const OB_CONTS: readonly ObContainer[] = [
  { ext: 'mp4', name: 'MP4', blurbKey: 'cont.mp4.blurb' },
  { ext: 'mkv', name: 'MKV', blurbKey: 'cont.mkv.blurb' },
  { ext: 'webm', name: 'WebM', blurbKey: 'cont.webm.blurb' },
] as const;
