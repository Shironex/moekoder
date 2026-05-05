/**
 * FFmpeg Encoding Settings — Moekoder v0.4.0
 *
 * v0.4.0 widens the v0.1 narrow shape into a discriminated-union over
 * `codec`, so each codec branch carries only its valid hardware paths and
 * codec-specific knobs:
 *
 *   - `h264` → `nvenc` | `qsv` | `libx264`
 *   - `hevc` → `nvenc` | `libx265`
 *   - `av1`  → `nvenc` | `libsvtav1`
 *
 * The discriminant lets `args.ts` exhaustiveness-check every codec branch
 * at compile time and removes whole classes of "h264 + libsvtav1 + cq=23
 * fast preset" frankenstein states that the v0.1 flat shape made
 * representable.
 *
 * Per-codec Balanced presets ship as named constants
 * ({@link H264_BALANCED_PRESET} etc.). The legacy export `BALANCED_PRESET`
 * remains pointing at the H.264 preset for backwards compatibility — older
 * call sites that merge `{ ...BALANCED_PRESET, ...input.settings }` keep
 * compiling, but new orchestrator code MUST select the per-codec default
 * via {@link defaultsFor} before the spread (see the gotcha in the v0.4
 * research doc).
 *
 * Fast / Pristine tiers per codec land in Phase B.
 */

export type VideoCodec = 'h264' | 'hevc' | 'av1';

/**
 * Audio plan:
 * - `copy`    — stream-copy source audio (no re-encode, bit-perfect, fastest)
 * - `aac-192k` — transcode to AAC 192k (required when targeting MP4 with a
 *                lossless source ffmpeg refuses to remux into MP4, see
 *                {@link shouldTranscodeAudio})
 */
export type AudioAction = 'copy' | 'aac-192k';

/**
 * Rate control modes — mapped per encoder family by the arg builder:
 * - NVENC:    cq / vbr / vbr_hq / cbr
 * - libx264 / libx265 / libsvtav1:  CRF-based (cq only, others fall back)
 * - QSV:      global_quality (cq) / VBR variants supported in ffmpeg
 */
export type RateControl = 'cq' | 'vbr' | 'vbr_hq' | 'cbr';

export type Container = 'mp4' | 'mkv';

export type NvencPreset = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';

/** libx265 `-preset` token set — same family as libx264 but a separate domain. */
export type Libx265Preset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow';

/**
 * SVT-AV1 `-preset` is a small integer (0=highest quality / slowest,
 * 13=fastest). Kept as its own type so the UI can slider over the integer
 * domain without colliding with the NVENC `pN` tokens.
 */
export type SvtAv1Preset = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/**
 * Common fields shared across every codec branch. The discriminated union
 * adds the codec discriminant + codec-specific encoder knobs on top.
 */
interface BaseEncodingSettings {
  rateControl: RateControl;
  /** Constant-quality value (lower = higher quality). Range differs per codec:
   *  H.264 NVENC / libx264 / HEVC NVENC / libx265 use 0..51; libsvtav1 uses
   *  0..63; AV1 NVENC uses 0..51. UI clamps + labels per codec. */
  cq: number;
  container: Container;
  audio: AudioAction;
}

export interface H264NvencSettings extends BaseEncodingSettings {
  codec: 'h264';
  hwAccel: 'nvenc';
  nvencPreset: NvencPreset;
  /** libx264 ignores; NVENC honours `hq` everywhere. Carried for type symmetry. */
  tune: 'animation' | 'film' | null;
}

export interface H264QsvSettings extends BaseEncodingSettings {
  codec: 'h264';
  hwAccel: 'qsv';
  nvencPreset: NvencPreset;
  tune: 'animation' | 'film' | null;
}

export interface H264SoftwareSettings extends BaseEncodingSettings {
  codec: 'h264';
  hwAccel: 'libx264';
  nvencPreset: NvencPreset;
  tune: 'animation' | 'film' | null;
}

export interface HevcNvencSettings extends BaseEncodingSettings {
  codec: 'hevc';
  hwAccel: 'nvenc';
  nvencPreset: NvencPreset;
  /** Set to true to emit 10-bit `yuv420p10le` output (HEVC main10). */
  tenBit: boolean;
}

export interface HevcSoftwareSettings extends BaseEncodingSettings {
  codec: 'hevc';
  hwAccel: 'libx265';
  libx265Preset: Libx265Preset;
  /** libx265 default is `animation`; v0.4 keeps it pinned for the anime use case. */
  tune: 'animation' | 'grain' | 'psnr' | 'ssim' | 'fastdecode' | 'zerolatency' | null;
}

export interface Av1NvencSettings extends BaseEncodingSettings {
  codec: 'av1';
  hwAccel: 'nvenc';
  nvencPreset: NvencPreset;
  tenBit: boolean;
}

export interface Av1SoftwareSettings extends BaseEncodingSettings {
  codec: 'av1';
  hwAccel: 'libsvtav1';
  svtPreset: SvtAv1Preset;
}

/**
 * Tagged union over `codec`. Use the `codec` + `hwAccel` discriminants
 * together to narrow further (e.g. `if (s.codec === 'hevc' && s.hwAccel ===
 * 'libx265') { … s.libx265Preset … }`).
 */
export type EncodingSettings =
  | H264NvencSettings
  | H264QsvSettings
  | H264SoftwareSettings
  | HevcNvencSettings
  | HevcSoftwareSettings
  | Av1NvencSettings
  | Av1SoftwareSettings;

/**
 * Hardware-accel axis kept around as a convenience union for consumers
 * that just need to know the encoder family without discriminating on
 * codec. Note that not every (codec, hwAccel) tuple is legal — see the
 * branch types above.
 */
export type HwAccel = EncodingSettings['hwAccel'];

/**
 * v0.4 ships three preset tiers per codec: Fast (lower CQ ceiling, fastest
 * encode), Balanced (anime-archival defaults), Pristine (slowest, highest
 * quality). Phase B exports the Fast/Pristine constants; Phase A only
 * needs Balanced (the v0.1 default that every existing call site refers to).
 */
export type PresetName = 'fast' | 'balanced' | 'pristine';

/**
 * H.264 Balanced — the v0.1 default. CQ 19 + NVENC p4 lands around
 * 2.5 Mbps for typical 1080p anime. Software/QSV branches inherit the
 * same CQ; libx264 maps it onto CRF and ignores nvencPreset.
 */
export const H264_BALANCED_PRESET: H264NvencSettings = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 19,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};

/**
 * HEVC Balanced — CQ 22 ≈ visually equivalent to H.264 CQ 19 thanks to
 * HEVC's more efficient coding. NVENC default. 10-bit on for HEVC's main10
 * sweet spot.
 */
export const HEVC_BALANCED_PRESET: HevcNvencSettings = {
  codec: 'hevc',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 22,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/**
 * AV1 Balanced — CQ 28 ≈ visually equivalent to HEVC CQ 22 / H.264 CQ 19
 * at AV1's higher coding efficiency. NVENC default; 10-bit on. Falls back
 * to libsvtav1 when `av1_nvenc` is absent in the GPU probe.
 */
export const AV1_BALANCED_PRESET: Av1NvencSettings = {
  codec: 'av1',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 28,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/**
 * Legacy alias — older orchestrator code spreads `{ ...BALANCED_PRESET,
 * ...input.settings }` to fill missing fields on a partial. Keep this
 * pointing at H.264 so the old behaviour (and the v0.1 args.test.ts shape
 * lock) is unchanged. New code should call {@link defaultsFor} instead.
 */
export const BALANCED_PRESET = H264_BALANCED_PRESET;

/**
 * Per-codec Balanced default selector. The orchestrator's preset merge
 * MUST go through this helper before the spread — `Partial<DiscriminatedUnion>`
 * does not preserve the discriminant linkage, so spreading a generic
 * Partial onto an H.264 default produces a frankenstein blob when the
 * caller intended HEVC or AV1. See the v0.4 research doc gotchas.
 */
export const defaultsFor = (codec: VideoCodec | undefined): EncodingSettings => {
  switch (codec) {
    case 'hevc':
      return HEVC_BALANCED_PRESET;
    case 'av1':
      return AV1_BALANCED_PRESET;
    case 'h264':
    case undefined:
      return H264_BALANCED_PRESET;
  }
};

/**
 * Average output bitrate we assume for the Balanced preset when running a
 * preflight disk-space check. Pinned to the H.264 number so HEVC + AV1
 * over-reserve disk — preflight is a guard, not a budget, and a smaller
 * actual output is always the safe direction.
 *
 * Pure estimate: the actual encode runs with CQ, not CBR, so real output
 * can deviate ±30 % depending on source complexity. Preflight adds a
 * 200 MiB safety margin on top to absorb that variance.
 */
export const BALANCED_BITRATE_KBPS = 2500;
