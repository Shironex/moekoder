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
  /** English step label shown in the rail. */
  label: string;
  /** Mono subtitle like "ffmpeg · 引擎". */
  mono: string;
  /** Whether the step exposes a "Skip for now" footer affordance. */
  skippable: boolean;
}

export const OB_STEPS: readonly OnboardingStepMeta[] = [
  { id: 'welcome', n: '壱', kanji: '迎', label: 'Welcome', mono: 'intro · 挨拶', skippable: false },
  { id: 'engine', n: '弐', kanji: '引', label: 'Engine', mono: 'ffmpeg · 引擎', skippable: false },
  { id: 'hw', n: '参', kanji: '核', label: 'Hardware', mono: 'gpu · 核', skippable: false },
  { id: 'theme', n: '肆', kanji: '色', label: 'Theme', mono: 'look · 色', skippable: true },
  { id: 'preset', n: '伍', kanji: '設', label: 'Preset', mono: 'quality · 設', skippable: true },
  { id: 'save', n: '陸', kanji: '箱', label: 'Save to', mono: 'output · 保存', skippable: true },
  { id: 'cont', n: '漆', kanji: '器', label: 'Container', mono: 'format · 器', skippable: true },
  { id: 'privacy', n: '捌', kanji: '静', label: 'Privacy', mono: 'quiet · 静', skippable: false },
  { id: 'done', n: '玖', kanji: '始', label: 'Get started', mono: 'finish · 始', skippable: false },
] as const;

// ---------------------------------------------------------------------------
// Engine step — ffmpeg + ffprobe download substages.
// ---------------------------------------------------------------------------

export interface DlStage {
  id: 'resolve' | 'ffmpeg' | 'ffprobe' | 'verify' | 'install';
  /** Kanji glyph shown inside the stage node. */
  k: string;
  label: string;
  sub: string;
  /** Approximate download size in megabytes. `null` for non-network stages. */
  size: number | null;
}

export const DL_STAGES: readonly DlStage[] = [
  { id: 'resolve', k: '尋', label: 'Resolve mirror', sub: 'github releases', size: null },
  { id: 'ffmpeg', k: '録', label: 'Download ffmpeg.exe', sub: 'BtbN · 7.0.1', size: 88.4 },
  { id: 'ffprobe', k: '測', label: 'Download ffprobe.exe', sub: 'BtbN · 7.0.1', size: 88.1 },
  { id: 'verify', k: '印', label: 'Verify SHA-256', sub: 'tamper check', size: null },
  {
    id: 'install',
    k: '置',
    label: 'Install to AppData',
    sub: '%LOCALAPPDATA%\\MoeKoder\\bin',
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
  name: string;
  hint: string;
  specs: ReadonlyArray<readonly [string, string]>;
}

export const OB_PRESETS: readonly ObPreset[] = [
  {
    id: 'fast',
    k: '速',
    name: 'Fast',
    hint: 'Quick drafts — watch tonight, delete tomorrow.',
    specs: [
      ['ffmpeg', 'p2'],
      ['cq', '23'],
      ['speed', '12×'],
    ],
  },
  {
    id: 'balanced',
    k: '均',
    name: 'Balanced',
    hint: 'The everyday setting. 95% of the quality at 40% of the bitrate.',
    specs: [
      ['ffmpeg', 'p4'],
      ['cq', '19'],
      ['speed', '6×'],
    ],
  },
  {
    id: 'pristine',
    k: '極',
    name: 'Pristine',
    hint: 'Archival rips for the kept folder. Leave the kettle on twice.',
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

export type ObSaveId = 'wypalone' | 'same' | 'subbed' | 'custom';

export interface ObSave {
  id: ObSaveId;
  k: string;
  label: string;
  /** Example path string — `null` for the custom option (user picks). */
  path: string | null;
}

export const OB_SAVES: readonly ObSave[] = [
  {
    id: 'wypalone',
    k: '隣',
    label: 'Beside source · in ./wypalone/',
    path: 'D:\\anime\\<source-folder>\\wypalone\\',
  },
  {
    id: 'same',
    k: '同',
    label: 'Same folder as source',
    path: 'D:\\anime\\<source-folder>\\',
  },
  {
    id: 'subbed',
    k: '済',
    label: 'A dedicated "subbed" folder',
    path: 'D:\\anime\\subbed\\',
  },
  {
    id: 'custom',
    k: '択',
    label: "Custom path — I'll pick",
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
  blurb: string;
}

export const OB_CONTS: readonly ObContainer[] = [
  { ext: 'mp4', name: 'MP4', blurb: 'Universal. Plays everywhere — Plex, phones, old TVs.' },
  { ext: 'mkv', name: 'MKV', blurb: 'Many tracks. Best for multi-audio & soft-subs.' },
  { ext: 'webm', name: 'WebM', blurb: 'Open codec. Smaller files, slower encode.' },
] as const;
