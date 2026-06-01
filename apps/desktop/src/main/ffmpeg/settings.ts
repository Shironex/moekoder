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

import type { GpuVendor } from './gpu-probe';

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

/**
 * AMF (AMD hardware) quality preset. Distinct from the NVENC `pN` family —
 * ffmpeg's `h264_amf` / `hevc_amf` expose a three-step `-quality` option
 * (alias `-preset`) whose values are exactly `speed` / `balanced` / `quality`.
 * Verified against the ffmpeg source AVOption table (libavcodec/amfenc_h264.c
 * + amfenc_hevc.c). NOT the NVENC `p1..p7` tokens — do not cross them.
 */
export type AmfQuality = 'speed' | 'balanced' | 'quality';

/**
 * AMF H.264 settings. AMF has no per-frame CQ knob like NVENC's `-cq:v`;
 * constant-quality is expressed as constant-QP (`-rc cqp` + `-qp_i/-qp_p/-qp_b`)
 * carrying the shared `cq` value as the QP target. Only `rateControl: 'cq'` is
 * fully expressible — VBR/CBR need a bitrate field this shape does not carry,
 * so the arg builder always emits `cqp` for AMF (see args.ts amfRcArgs).
 */
export interface H264AmfSettings extends BaseEncodingSettings {
  codec: 'h264';
  hwAccel: 'amf';
  amfQuality: AmfQuality;
}

/**
 * AMF HEVC settings. Mirrors {@link H264AmfSettings}; adds the `tenBit` flag.
 * 10-bit on AMF feeds the encoder `p010le` (AV_PIX_FMT_P010, per
 * libavcodec/amfenc.c `ff_amf_pix_fmts[]`) — NOT the NVENC `yuv420p10le` token.
 */
export interface HevcAmfSettings extends BaseEncodingSettings {
  codec: 'hevc';
  hwAccel: 'amf';
  amfQuality: AmfQuality;
  /** Set to true to emit 10-bit `p010le` output (HEVC main10). */
  tenBit: boolean;
}

/**
 * AV1 has NO AMF variant — ffmpeg ships no `av1_amf` encoder, and the GPU
 * probe regex only matches `h264_amf` / `hevc_amf`. The union deliberately
 * omits an `Av1AmfSettings` member so `{ codec: 'av1', hwAccel: 'amf' }` is
 * non-representable and the orchestrator's hwAccel rewrite leaves AV1 alone.
 */

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
  | H264AmfSettings
  | H264SoftwareSettings
  | HevcNvencSettings
  | HevcAmfSettings
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
 * quality). Per-codec CQ targets per the roadmap: H.264 starts at CQ 19,
 * HEVC nudges +3, AV1 nudges +6 to land at visually-equivalent quality.
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

// -----------------------------------------------------------------------------
// Fast / Pristine tiers per codec.
//
// Fast tilts the CQ + preset towards quick turnaround for previews. Pristine
// tilts the CQ + preset towards archival quality at the cost of encode time.
// All three tiers stream-copy audio + emit MP4 — the user can flip those axes
// independently from the tier picker.
// -----------------------------------------------------------------------------

/** H.264 NVENC — preview-grade preset. CQ 23, NVENC p2, animation tune. */
export const H264_FAST_PRESET: H264NvencSettings = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 23,
  nvencPreset: 'p2',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};

/** H.264 NVENC — archival-grade preset. CQ 16, NVENC p7, animation tune. */
export const H264_PRISTINE_PRESET: H264NvencSettings = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 16,
  nvencPreset: 'p7',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};

/** HEVC NVENC — preview-grade preset. CQ 26 (Balanced + 4), NVENC p2, 10-bit. */
export const HEVC_FAST_PRESET: HevcNvencSettings = {
  codec: 'hevc',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 26,
  nvencPreset: 'p2',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/** HEVC NVENC — archival-grade preset. CQ 19, NVENC p7, 10-bit. */
export const HEVC_PRISTINE_PRESET: HevcNvencSettings = {
  codec: 'hevc',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 19,
  nvencPreset: 'p7',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/** AV1 NVENC — preview-grade preset. CQ 32, NVENC p2, 10-bit. */
export const AV1_FAST_PRESET: Av1NvencSettings = {
  codec: 'av1',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 32,
  nvencPreset: 'p2',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/** AV1 NVENC — archival-grade preset. CQ 24, NVENC p7, 10-bit. */
export const AV1_PRISTINE_PRESET: Av1NvencSettings = {
  codec: 'av1',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 24,
  nvencPreset: 'p7',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

// -----------------------------------------------------------------------------
// AMF (AMD hardware) presets — fallback path used when the GPU probe reports
// `amf` but not the requested vendor. CQ targets mirror the NVENC tiers so a
// user switching GPUs gets visually-comparable output. AMF maps `cq` onto a
// constant QP via `-rc cqp` (see args.ts), so these CQ numbers are QP targets.
// `amfQuality` mirrors the NVENC preset intent: balanced ≈ p4, speed ≈ p2,
// quality ≈ p7. No AV1 — ffmpeg has no av1_amf encoder.
//
// These are not referenced by `getPreset` (which returns NVENC-shaped presets);
// `resolveHwAccel` rewrites to AMF at encode time. They are the canonical AMF
// preset values and serve as the shared fixtures for the AMF arg/resolve tests.
// -----------------------------------------------------------------------------

/** H.264 AMF — anime-archival default. QP 19, balanced quality preset. */
export const H264_AMF_BALANCED_PRESET: H264AmfSettings = {
  codec: 'h264',
  hwAccel: 'amf',
  rateControl: 'cq',
  cq: 19,
  amfQuality: 'balanced',
  container: 'mp4',
  audio: 'copy',
};

/** H.264 AMF — preview-grade. QP 23, speed quality preset. */
export const H264_AMF_FAST_PRESET: H264AmfSettings = {
  codec: 'h264',
  hwAccel: 'amf',
  rateControl: 'cq',
  cq: 23,
  amfQuality: 'speed',
  container: 'mp4',
  audio: 'copy',
};

/** H.264 AMF — archival-grade. QP 16, quality quality preset. */
export const H264_AMF_PRISTINE_PRESET: H264AmfSettings = {
  codec: 'h264',
  hwAccel: 'amf',
  rateControl: 'cq',
  cq: 16,
  amfQuality: 'quality',
  container: 'mp4',
  audio: 'copy',
};

/** HEVC AMF — anime-archival default. QP 22, balanced, 10-bit. */
export const HEVC_AMF_BALANCED_PRESET: HevcAmfSettings = {
  codec: 'hevc',
  hwAccel: 'amf',
  rateControl: 'cq',
  cq: 22,
  amfQuality: 'balanced',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/** HEVC AMF — preview-grade. QP 26, speed, 10-bit. */
export const HEVC_AMF_FAST_PRESET: HevcAmfSettings = {
  codec: 'hevc',
  hwAccel: 'amf',
  rateControl: 'cq',
  cq: 26,
  amfQuality: 'speed',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/** HEVC AMF — archival-grade. QP 19, quality, 10-bit. */
export const HEVC_AMF_PRISTINE_PRESET: HevcAmfSettings = {
  codec: 'hevc',
  hwAccel: 'amf',
  rateControl: 'cq',
  cq: 19,
  amfQuality: 'quality',
  container: 'mp4',
  audio: 'copy',
  tenBit: true,
};

/**
 * Look up a preset constant by codec + tier. Renderer's quick-set buttons
 * use this to overwrite the persisted `encoding` blob in one click. The
 * NVENC variants are returned for HEVC/AV1 because they're the broadest
 * compatibility default — the encoding section UI re-routes to the
 * software equivalent when the user has no NVENC encoder for that codec.
 */
export const getPreset = (codec: VideoCodec, tier: PresetName): EncodingSettings => {
  if (codec === 'h264') {
    if (tier === 'fast') return H264_FAST_PRESET;
    if (tier === 'pristine') return H264_PRISTINE_PRESET;
    return H264_BALANCED_PRESET;
  }
  if (codec === 'hevc') {
    if (tier === 'fast') return HEVC_FAST_PRESET;
    if (tier === 'pristine') return HEVC_PRISTINE_PRESET;
    return HEVC_BALANCED_PRESET;
  }
  if (tier === 'fast') return AV1_FAST_PRESET;
  if (tier === 'pristine') return AV1_PRISTINE_PRESET;
  return AV1_BALANCED_PRESET;
};

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

/**
 * Reconcile requested settings against the vendors the GPU probe actually
 * found. The GPU probe detects `h264_amf` / `hevc_amf` (see gpu-probe.ts),
 * but nothing routes that detection into codec selection — so a user whose
 * settings default to `hwAccel: 'nvenc'` on an AMD-only machine would emit
 * `h264_nvenc` and ffmpeg would fail with "unknown encoder" at encode time.
 *
 * This is the routing seam: when the requested hardware vendor is absent from
 * `available` but `amf` is present, rewrite H.264 / HEVC settings to a valid
 * AMF union member (carrying `cq` / `container` / `audio` / `tenBit` and a
 * derived `amfQuality`). It returns a fully-formed branch — never a partial
 * spread — so `args.ts` always sees `amfQuality` populated.
 *
 * Conservative by construction:
 *   - Only rewrites when the requested vendor is a hardware vendor that's
 *     genuinely missing AND `amf` is available.
 *   - Never rewrites AV1 (no `av1_amf` encoder exists) — AV1 falls through to
 *     its software path elsewhere.
 *   - Never rewrites an already-software path (`libx264` / `libx265` /
 *     `libsvtav1`); the user explicitly chose software.
 *   - Returns the input unchanged when no rewrite applies, so a probe failure
 *     (callers pass `available: []`) is a no-op, never a blocked encode.
 */
const AMF_QUALITY_FOR_NVENC_PRESET = (preset: NvencPreset): AmfQuality => {
  // NVENC pN preset → AMF speed/balanced/quality. p1..p3 favour speed,
  // p5..p7 favour quality, p4 sits balanced.
  if (preset === 'p1' || preset === 'p2' || preset === 'p3') return 'speed';
  if (preset === 'p5' || preset === 'p6' || preset === 'p7') return 'quality';
  return 'balanced';
};

export const resolveHwAccel = (
  settings: EncodingSettings,
  available: readonly GpuVendor[]
): EncodingSettings => {
  // Already software, or already AMF — nothing to reroute.
  if (settings.hwAccel === 'libx264' || settings.hwAccel === 'libx265') return settings;
  if (settings.hwAccel === 'libsvtav1' || settings.hwAccel === 'amf') return settings;

  // The requested hardware vendor is present — honour it verbatim.
  if (available.includes(settings.hwAccel)) return settings;

  // Requested vendor missing. AMF can only rescue H.264 / HEVC.
  if (!available.includes('amf')) return settings;

  if (settings.codec === 'h264') {
    const amfQuality =
      settings.hwAccel === 'nvenc'
        ? AMF_QUALITY_FOR_NVENC_PRESET(settings.nvencPreset)
        : 'balanced';
    const next: H264AmfSettings = {
      codec: 'h264',
      hwAccel: 'amf',
      rateControl: settings.rateControl,
      cq: settings.cq,
      amfQuality,
      container: settings.container,
      audio: settings.audio,
    };
    return next;
  }

  if (settings.codec === 'hevc') {
    const amfQuality =
      settings.hwAccel === 'nvenc'
        ? AMF_QUALITY_FOR_NVENC_PRESET(settings.nvencPreset)
        : 'balanced';
    const next: HevcAmfSettings = {
      codec: 'hevc',
      hwAccel: 'amf',
      rateControl: settings.rateControl,
      cq: settings.cq,
      amfQuality,
      container: settings.container,
      audio: settings.audio,
      // Only the NVENC HEVC branch carries `tenBit`; default off otherwise.
      tenBit: settings.hwAccel === 'nvenc' ? settings.tenBit : false,
    };
    return next;
  }

  // AV1 — no av1_amf encoder. Leave untouched; software fallback handles it.
  return settings;
};
