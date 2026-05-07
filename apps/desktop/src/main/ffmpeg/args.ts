/**
 * FFmpeg argument-array builder for a single-file hardsub encode.
 *
 * Single entry point: {@link buildEncodeArgs}. Splits by `settings.codec`
 * + `settings.hwAccel` (a discriminated union since v0.4):
 *
 *   - h264 / nvenc     → `h264_nvenc` with NVENC-flavoured rate-control args
 *   - h264 / qsv       → `h264_qsv` (fallback path, conservative defaults)
 *   - h264 / libx264   → software CRF with `-tune animation` by default
 *   - hevc / nvenc     → `hevc_nvenc`, optional 10-bit via yuv420p10le filter
 *   - hevc / libx265   → `libx265` CRF with `-preset` + animation tune
 *   - av1  / nvenc     → `av1_nvenc` (RTX 40+ only — gated by gpu-probe)
 *   - av1  / libsvtav1 → `libsvtav1` CRF with integer `-preset 0..13`
 *
 * All paths:
 *   - Escape the subtitle path through the 3-layer Windows / POSIX escape
 *     (see `path-escape.ts`).
 *   - Emit `-progress pipe:1 -nostats` so `parseProgressPipe` can consume
 *     structured progress over stdout.
 *   - Write `-movflags +faststart` for MP4 so players can begin playback
 *     before the muxer has finished writing the moov atom.
 *   - Append `-tag:v hvc1` for HEVC + MP4 (Phase F) so QuickTime / iOS
 *     pick up the stream as HEVC.
 *   - Optionally inject `-ss <start> -t <duration>` between input + filter
 *     when `clipWindow` is set (benchmark mode).
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
  /**
   * Optional clip window for benchmark mode. When set, the builder emits
   * `-ss <startSec> -t <durationSec>` before the input so ffmpeg only
   * decodes the requested slice. Input-side seek is fine for benchmark
   * accuracy — keyframe alignment matters less for a 10s sample than the
   * speed it shaves off the decoder.
   */
  clipWindow?: { startSec: number; durationSec: number };
}

/**
 * Determine whether the filter chain should output 10-bit pixel data.
 * NVENC HEVC + AV1 main10 paths benefit from it; libx265 / libsvtav1
 * pick up the bit depth from the source by default and don't need a
 * pixfmt forcing filter.
 */
const wantsTenBitFilter = (settings: EncodingSettings): boolean => {
  if (settings.hwAccel !== 'nvenc') return false;
  if (settings.codec === 'h264') return false;
  return settings.tenBit;
};

const buildFilterChain = (subtitlePath: string, settings: EncodingSettings): string => {
  const parts = [`subtitles='${escapeSubtitlePath(subtitlePath)}'`];

  if (settings.hwAccel === 'nvenc') {
    if (wantsTenBitFilter(settings)) {
      // HEVC / AV1 NVENC main10 — feed the encoder 10-bit yuv420p10le.
      parts.push('format=yuv420p10le');
    } else {
      // H.264 NVENC can't ingest 10-bit yuv420p10le directly; normalise upstream.
      parts.push('format=yuv420p');
    }
  }

  return parts.join(',');
};

/**
 * NVENC rate-control token mapping. CQ + VBR-HQ both ride the `vbr` token
 * with `-cq:v` carrying the quality target; CBR + plain VBR pass through.
 */
const nvencRcToken = (rc: EncodingSettings['rateControl']): string => {
  return rc === 'cq' || rc === 'vbr_hq' ? 'vbr' : rc;
};

const NVENC_QUALITY_FLAGS = [
  '-tune',
  'hq',
  '-spatial_aq',
  '1',
  '-temporal_aq',
  '1',
  '-rc-lookahead',
  '32',
];

const buildVideoArgs = (settings: EncodingSettings): string[] => {
  if (settings.codec === 'h264') {
    if (settings.hwAccel === 'nvenc') {
      return [
        '-c:v',
        'h264_nvenc',
        '-preset',
        settings.nvencPreset,
        '-rc:v',
        nvencRcToken(settings.rateControl),
        '-cq:v',
        String(settings.cq),
        ...NVENC_QUALITY_FLAGS,
      ];
    }

    if (settings.hwAccel === 'qsv') {
      return ['-c:v', 'h264_qsv', '-global_quality', String(settings.cq), '-look_ahead', '1'];
    }

    // libx264 — software fallback. CRF is the only quality mode we expose.
    return [
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-tune',
      settings.tune ?? 'animation',
      '-crf',
      String(settings.cq),
    ];
  }

  if (settings.codec === 'hevc') {
    if (settings.hwAccel === 'nvenc') {
      return [
        '-c:v',
        'hevc_nvenc',
        '-preset',
        settings.nvencPreset,
        '-rc:v',
        nvencRcToken(settings.rateControl),
        '-cq:v',
        String(settings.cq),
        ...NVENC_QUALITY_FLAGS,
      ];
    }

    // libx265 software path. CRF mode + the libx265-specific preset family.
    return [
      '-c:v',
      'libx265',
      '-preset',
      settings.libx265Preset,
      '-tune',
      settings.tune ?? 'animation',
      '-crf',
      String(settings.cq),
    ];
  }

  // AV1.
  if (settings.hwAccel === 'nvenc') {
    return [
      '-c:v',
      'av1_nvenc',
      '-preset',
      settings.nvencPreset,
      '-rc:v',
      nvencRcToken(settings.rateControl),
      '-cq:v',
      String(settings.cq),
      ...NVENC_QUALITY_FLAGS,
    ];
  }

  // libsvtav1 software path. Integer preset 0..13; CRF mode.
  return ['-c:v', 'libsvtav1', '-preset', String(settings.svtPreset), '-crf', String(settings.cq)];
};

const buildAudioArgs = (settings: EncodingSettings): string[] => {
  if (settings.audio === 'copy') {
    return ['-c:a', 'copy'];
  }
  return ['-c:a', 'aac', '-b:a', '192k'];
};

/**
 * Container-specific flags. MP4 always gets `-movflags +faststart`; HEVC
 * + MP4 also wants `-tag:v hvc1` so QuickTime / iOS recognise the stream.
 */
const buildContainerArgs = (settings: EncodingSettings): string[] => {
  if (settings.container !== 'mp4') return [];
  const args = ['-movflags', '+faststart'];
  if (settings.codec === 'hevc') {
    args.push('-tag:v', 'hvc1');
  }
  return args;
};

/**
 * Builds the complete ffmpeg argument array for the given encode job.
 * Arguments are returned as a string array — callers pass them directly
 * to `child_process.spawn` with no shell in the middle, so no additional
 * quoting is needed around paths.
 */
export const buildEncodeArgs = (job: EncodeJob): string[] => {
  const { videoPath, subtitlePath, outputPath, settings, clipWindow } = job;

  const args: string[] = [];

  // Optional clip window — benchmark mode only. Input-side seek + duration
  // emitted before `-i` so ffmpeg can fast-seek the demuxer.
  if (clipWindow) {
    args.push('-ss', String(clipWindow.startSec), '-t', String(clipWindow.durationSec));
  }

  // Input.
  args.push('-i', videoPath);

  // Video filter chain: subtitle burn-in (+ codec-aware pix fmt for NVENC).
  args.push('-vf', buildFilterChain(subtitlePath, settings));

  // Video encoder + rate control.
  args.push(...buildVideoArgs(settings));

  // Audio plan (pre-settled by the processor).
  args.push(...buildAudioArgs(settings));

  // Container-specific flags.
  args.push(...buildContainerArgs(settings));

  // Structured progress over stdout.
  args.push('-progress', 'pipe:1', '-nostats');

  // Overwrite + output.
  args.push('-y', outputPath);

  return args;
};
