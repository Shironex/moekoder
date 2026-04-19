/**
 * FFmpeg argument-array builder for a single-file hardsub encode.
 *
 * Single entry point: {@link buildEncodeArgs}. Splits by `hwAccel`:
 *   - nvenc     → `h264_nvenc` with NVENC-flavoured rate-control args
 *   - qsv       → `h264_qsv` (fallback path, conservative defaults)
 *   - libx264   → software CRF with `-tune animation` by default
 *
 * All paths:
 *   - Escape the subtitle path through the 3-layer Windows / POSIX escape
 *     (see `path-escape.ts`).
 *   - Emit `-progress pipe:1 -nostats` so {@link parseProgressPipe} can
 *     consume structured progress over stdout.
 *   - Write `-movflags +faststart` for MP4 so players can begin playback
 *     before the muxer has finished writing the moov atom.
 *   - Overwrite (`-y`) — the orchestrator owns output-path collision checks.
 *   - Auto-transcode incompatible audio to AAC 192k when targeting MP4
 *     (see {@link shouldTranscodeAudio}).
 */
import { escapeSubtitlePath } from './path-escape';
import type { EncodingSettings } from './settings';

export interface EncodeJob {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  settings: EncodingSettings;
  /** Detected source audio codec — used by the audio-fallback logic. */
  sourceAudioCodec?: string;
}

/**
 * Source audio codecs that ffmpeg refuses to stream-copy into an MP4
 * container (lossless PCM / TrueHD / DTS / FLAC). When the user targets
 * MP4 with one of these, we transparently transcode to AAC 192k rather
 * than failing with the opaque `Could not find tag for codec ... in
 * stream` muxer error.
 */
const LOSSLESS_IN_MP4_INCOMPATIBLE = new Set(['truehd', 'dts', 'flac', 'pcm_s16le', 'pcm_s24le']);

/** Internal — exported as a standalone helper in audio-fallback.ts. */
export const shouldTranscodeAudio = (
  sourceCodec: string | undefined,
  container: EncodingSettings['container']
): boolean => {
  if (container !== 'mp4' || !sourceCodec) return false;
  return LOSSLESS_IN_MP4_INCOMPATIBLE.has(sourceCodec.toLowerCase());
};

const buildFilterChain = (subtitlePath: string, hwAccel: EncodingSettings['hwAccel']): string => {
  const parts = [`subtitles='${escapeSubtitlePath(subtitlePath)}'`];
  if (hwAccel === 'nvenc') {
    // NVENC can't ingest 10-bit yuv420p10le directly; normalise upstream.
    parts.push('format=yuv420p');
  }
  return parts.join(',');
};

const buildVideoArgs = (settings: EncodingSettings): string[] => {
  const { hwAccel, rateControl, cq, nvencPreset, tune } = settings;

  if (hwAccel === 'nvenc') {
    return [
      '-c:v',
      'h264_nvenc',
      '-preset',
      nvencPreset,
      '-rc:v',
      // NVENC's rate-control token set: pass `vbr` / `cbr` straight through,
      // map `cq` to `vbr` (CQ is encoded as vbr + -cq:v), and `vbr_hq` to
      // `vbr` with HQ-flavoured extras below.
      rateControl === 'cq' || rateControl === 'vbr_hq' ? 'vbr' : rateControl,
      '-cq:v',
      String(cq),
      '-tune',
      'hq',
      '-spatial_aq',
      '1',
      '-temporal_aq',
      '1',
      '-rc-lookahead',
      '32',
    ];
  }

  if (hwAccel === 'qsv') {
    return ['-c:v', 'h264_qsv', '-global_quality', String(cq), '-look_ahead', '1'];
  }

  // libx264 — software fallback. CRF is the only quality mode we expose.
  return [
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-tune',
    tune ?? 'animation',
    '-crf',
    String(cq),
  ];
};

const buildAudioArgs = (
  settings: EncodingSettings,
  sourceAudioCodec: string | undefined
): string[] => {
  const effectiveAudio =
    settings.audio === 'copy' && shouldTranscodeAudio(sourceAudioCodec, settings.container)
      ? 'aac-192k'
      : settings.audio;

  if (effectiveAudio === 'copy') {
    return ['-c:a', 'copy'];
  }
  return ['-c:a', 'aac', '-b:a', '192k'];
};

/**
 * Builds the complete ffmpeg argument array for the given encode job.
 * Arguments are returned as a string array — callers pass them directly
 * to `child_process.spawn` with no shell in the middle, so no additional
 * quoting is needed around paths.
 */
export const buildEncodeArgs = (job: EncodeJob): string[] => {
  const { videoPath, subtitlePath, outputPath, settings, sourceAudioCodec } = job;

  const args: string[] = [];

  // Input.
  args.push('-i', videoPath);

  // Video filter chain: subtitle burn-in (+ NVENC-friendly pix fmt).
  args.push('-vf', buildFilterChain(subtitlePath, settings.hwAccel));

  // Video encoder + rate control.
  args.push(...buildVideoArgs(settings));

  // Audio plan (with MP4-lossless auto-transcode).
  args.push(...buildAudioArgs(settings, sourceAudioCodec));

  // Container-specific flags.
  if (settings.container === 'mp4') {
    args.push('-movflags', '+faststart');
  }

  // Structured progress over stdout.
  args.push('-progress', 'pipe:1', '-nostats');

  // Overwrite + output.
  args.push('-y', outputPath);

  return args;
};
