/**
 * FFmpeg Encoding Settings — Moekoder v0.1.0
 *
 * v0.1.0 ships a single codec (H.264) across three hardware paths and one
 * preset ("Balanced"). HEVC + AV1 land in v0.2+. Shape is intentionally
 * narrow so UI work in Phase 4 has a small surface to bind to.
 */

export type VideoCodec = 'h264';

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
 * - libx264:  CRF-based (cq only, other modes silently fall back)
 * - QSV:      global_quality (cq) / VBR variants supported in ffmpeg
 */
export type RateControl = 'cq' | 'vbr' | 'vbr_hq' | 'cbr';

export type HwAccel = 'nvenc' | 'qsv' | 'libx264';

export type PresetName = 'balanced';

export interface EncodingSettings {
  codec: VideoCodec;
  hwAccel: HwAccel;
  rateControl: RateControl;
  /** Constant quality value (lower = higher quality). NVENC preset p4 defaults to 19. */
  cq: number;
  /** NVENC preset p1..p7 (software ignores). */
  nvencPreset: 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';
  /** Container ext without dot. */
  container: 'mp4' | 'mkv';
  /** Audio behavior — see {@link shouldTranscodeAudio} for fallback rules. */
  audio: AudioAction;
  /** libx264 `-tune` value; NVENC/QSV ignore. */
  tune: 'animation' | 'film' | null;
}

/**
 * The one preset that ships in v0.1.0. Aimed at anime / animation content —
 * CQ 19 on H.264 NVENC p4 lands around 2.5 Mbps for typical 1080p sources.
 * Audio stream-copied by default; arg builder flips this to AAC 192k when
 * the source codec won't remux into the chosen container.
 */
export const BALANCED_PRESET: EncodingSettings = {
  codec: 'h264',
  hwAccel: 'nvenc',
  rateControl: 'cq',
  cq: 19,
  nvencPreset: 'p4',
  container: 'mp4',
  audio: 'copy',
  tune: 'animation',
};
