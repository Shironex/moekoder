/**
 * Renderer-side helpers for the v0.4 encoding profile.
 *
 * The desktop's `EncodingSettings` is a discriminated union over `codec` +
 * `hwAccel` (apps/desktop/src/main/ffmpeg/settings.ts). The renderer never
 * imports that module — it'd drag main-process code into the browser
 * bundle. Instead we work with `EncodingProfile` (a `Record<string,
 * unknown>` defined in `@moekoder/shared`) and validate / read individual
 * fields through these helpers.
 *
 * These constants mirror the per-codec presets from
 * `apps/desktop/src/main/ffmpeg/settings.ts`. Keep them in lockstep with
 * the desktop side — the IPC layer revalidates the shape but the UI
 * defaults need to match what the orchestrator will accept.
 */
import type { EncodingProfile } from '@moekoder/shared';

export type Codec = 'h264' | 'hevc' | 'av1';
export type HwAccel = 'nvenc' | 'qsv' | 'libx264' | 'libx265' | 'libsvtav1';
export type Tier = 'fast' | 'balanced' | 'pristine';
export type Container = 'mp4' | 'mkv';
export type NvencPreset = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';

/** libx265 preset namespace. Used by the libx265 software branch. */
export const LIBX265_PRESETS = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
] as const;
export type Libx265Preset = (typeof LIBX265_PRESETS)[number];

/** SVT-AV1 preset domain — integer 0..13 (lower = slower / higher quality). */
export const SVT_PRESETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type SvtPreset = (typeof SVT_PRESETS)[number];

/** Hardware-accel families legal per codec. */
export const LEGAL_HW: Record<Codec, ReadonlyArray<HwAccel>> = {
  h264: ['nvenc', 'qsv', 'libx264'],
  hevc: ['nvenc', 'libx265'],
  av1: ['nvenc', 'libsvtav1'],
};

/** Display labels for each (codec, hwAccel) tuple. */
export const HW_LABEL: Record<HwAccel, string> = {
  nvenc: 'NVENC (GPU)',
  qsv: 'Intel QSV',
  libx264: 'libx264 (CPU)',
  libx265: 'libx265 (CPU)',
  libsvtav1: 'SVT-AV1 (CPU)',
};

/** Codec display labels. */
export const CODEC_LABEL: Record<Codec, string> = {
  h264: 'H.264',
  hevc: 'HEVC (H.265)',
  av1: 'AV1',
};

/**
 * CQ ranges differ per codec. libsvtav1 is 0..63; everything else is 0..51.
 * Lower = higher quality across the board.
 */
export const CQ_RANGE: Record<HwAccel, { min: number; max: number }> = {
  nvenc: { min: 0, max: 51 },
  qsv: { min: 0, max: 51 },
  libx264: { min: 0, max: 51 },
  libx265: { min: 0, max: 51 },
  libsvtav1: { min: 0, max: 63 },
};

/**
 * Per-codec encoder name we look for in `gpu.probe().details.nvenc.encoders`
 * to gate hardware options. `av1_nvenc` is RTX 40+ only — the probe
 * only emits it when the driver advertises hardware support.
 */
export const NVENC_ENCODER_NAME: Record<Codec, string> = {
  h264: 'h264_nvenc',
  hevc: 'hevc_nvenc',
  av1: 'av1_nvenc',
};

/**
 * Tier labels — used by the quick-set buttons on the Encoding section.
 */
export const TIER_LABEL: Record<Tier, string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  pristine: 'Pristine',
};

/**
 * Resolve a per-codec preset tier into a full encoding profile. Mirrors
 * `getPreset()` in `apps/desktop/src/main/ffmpeg/settings.ts`.
 */
export const presetFor = (codec: Codec, tier: Tier): EncodingProfile => {
  if (codec === 'h264') {
    if (tier === 'fast') return { ...H264_FAST };
    if (tier === 'pristine') return { ...H264_PRISTINE };
    return { ...H264_BALANCED };
  }
  if (codec === 'hevc') {
    if (tier === 'fast') return { ...HEVC_FAST };
    if (tier === 'pristine') return { ...HEVC_PRISTINE };
    return { ...HEVC_BALANCED };
  }
  if (tier === 'fast') return { ...AV1_FAST };
  if (tier === 'pristine') return { ...AV1_PRISTINE };
  return { ...AV1_BALANCED };
};

/* ----- preset constants (mirror desktop) ----- */

const H264_BALANCED: EncodingProfile = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 19,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};

const H264_FAST: EncodingProfile = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 23,
  nvencPreset: 'p2',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};

const H264_PRISTINE: EncodingProfile = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 16,
  nvencPreset: 'p7',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};

const HEVC_BALANCED: EncodingProfile = {
  codec: 'hevc',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 22,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

const HEVC_FAST: EncodingProfile = {
  codec: 'hevc',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 26,
  nvencPreset: 'p2',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

const HEVC_PRISTINE: EncodingProfile = {
  codec: 'hevc',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 19,
  nvencPreset: 'p7',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

const AV1_BALANCED: EncodingProfile = {
  codec: 'av1',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 28,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

const AV1_FAST: EncodingProfile = {
  codec: 'av1',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 32,
  nvencPreset: 'p2',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

const AV1_PRISTINE: EncodingProfile = {
  codec: 'av1',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 24,
  nvencPreset: 'p7',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/**
 * When the user switches codec, the previous codec's hwAccel may not be
 * legal under the new codec. Pick the first legal hwAccel that is also
 * present in the GPU probe (or fall back to the codec's software path).
 *
 * Returns a fully-shaped profile by deferring to the codec's Balanced
 * preset, then overlaying the user's existing rate-control + container +
 * audio choices so a codec swap doesn't reset everything else.
 */
export const switchCodec = (
  current: EncodingProfile,
  nextCodec: Codec,
  available: ReadonlyArray<HwAccel>
): EncodingProfile => {
  const balanced = presetFor(nextCodec, 'balanced');
  const desiredHw = current.hwAccel as HwAccel;
  const legal = LEGAL_HW[nextCodec];
  const pick = legal.includes(desiredHw)
    ? desiredHw
    : (legal.find(hw => available.includes(hw)) ?? legal[legal.length - 1]);
  // Software paths require their codec-specific knobs, so layer the
  // tier-defaulted balanced preset for that path on top.
  const branchDefault = pick === balanced.hwAccel ? balanced : presetForHwAccel(nextCodec, pick);
  return {
    ...branchDefault,
    rateControl: current.rateControl,
    cq: clampCq(current.cq as number, pick),
    container: current.container,
    audio: current.audio,
  };
};

/**
 * Resolve a codec + hwAccel tuple to a fully-formed default profile. Used
 * when the user switches the encoder family within a codec — the codec
 * defaults stay, the encoder-specific knobs (libx265Preset, svtPreset,
 * tune) come from the appropriate branch defaults.
 */
export const presetForHwAccel = (codec: Codec, hwAccel: HwAccel): EncodingProfile => {
  if (codec === 'h264') {
    if (hwAccel === 'nvenc') return { ...H264_BALANCED };
    if (hwAccel === 'qsv') {
      return { ...H264_BALANCED, hwAccel: 'qsv' };
    }
    return { ...H264_BALANCED, hwAccel: 'libx264' };
  }
  if (codec === 'hevc') {
    if (hwAccel === 'nvenc') return { ...HEVC_BALANCED };
    return {
      codec: 'hevc',
      hwAccel: 'libx265',
      rateControl: 'cq',
      cq: 22,
      libx265Preset: 'medium',
      container: 'mp4',
      audio: 'copy',
      tune: 'animation',
    };
  }
  // AV1
  if (hwAccel === 'nvenc') return { ...AV1_BALANCED };
  return {
    codec: 'av1',
    hwAccel: 'libsvtav1',
    rateControl: 'cq',
    cq: 30,
    svtPreset: 8,
    container: 'mp4',
    audio: 'copy',
  };
};

/** Clamp a CQ value into the legal range for the chosen hwAccel. */
export const clampCq = (cq: number, hwAccel: HwAccel): number => {
  const range = CQ_RANGE[hwAccel];
  if (!Number.isFinite(cq)) return Math.round((range.min + range.max) / 2);
  return Math.max(range.min, Math.min(range.max, Math.round(cq)));
};

/**
 * Reads the `codec` discriminant off an opaque profile, falling back to
 * H.264 when missing or unrecognised. The hook returns `null` while the
 * setting is hydrating, so callers should handle that case independently.
 */
export const codecOf = (profile: EncodingProfile | null | undefined): Codec => {
  if (!profile) return 'h264';
  const c = profile.codec;
  if (c === 'hevc' || c === 'av1') return c;
  return 'h264';
};

/** As above, for hwAccel. */
export const hwAccelOf = (profile: EncodingProfile | null | undefined): HwAccel => {
  if (!profile) return 'nvenc';
  const hw = profile.hwAccel;
  if (
    hw === 'qsv' ||
    hw === 'libx264' ||
    hw === 'libx265' ||
    hw === 'libsvtav1' ||
    hw === 'nvenc'
  ) {
    return hw;
  }
  return 'nvenc';
};
