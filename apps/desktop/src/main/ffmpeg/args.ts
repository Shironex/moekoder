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
 *   - Emit `-progress pipe:1 -nostats` so `parseProgressPipe` can consume
 *     structured progress over stdout.
 *   - Write `-movflags +faststart` for MP4 so players can begin playback
 *     before the muxer has finished writing the moov atom.
 *   - Overwrite (`-y`) — the orchestrator owns output-path collision checks.
 *
 * Audio is consumed verbatim from `settings.audio`: `copy` → stream-copy,
 * `aac-192k` → transcode. The caller (FFmpegProcessor) is responsible for
 * applying the lossless-in-MP4 audio fallback *before* calling into the
 * builder — keeping the decision in one place and letting the builder
 * remain a pure settings-to-args transform.
 */
import { escapeSubtitlePath } from './path-escape';
import type { EncodingSettings } from './settings';

export interface EncodeJob {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  settings: EncodingSettings;
  /** Detected source audio codec — informational only; the audio plan is
   *  already settled in `settings.audio` by the processor. */
  sourceAudioCodec?: string;
}

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

const buildAudioArgs = (settings: EncodingSettings): string[] => {
  if (settings.audio === 'copy') {
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
  const { videoPath, subtitlePath, outputPath, settings } = job;

  const args: string[] = [];

  // Input.
  args.push('-i', videoPath);

  // Video filter chain: subtitle burn-in (+ NVENC-friendly pix fmt).
  args.push('-vf', buildFilterChain(subtitlePath, settings.hwAccel));

  // Video encoder + rate control.
  args.push(...buildVideoArgs(settings));

  // Audio plan (pre-settled by the processor).
  args.push(...buildAudioArgs(settings));

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
