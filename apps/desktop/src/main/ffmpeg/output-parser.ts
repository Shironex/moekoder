/**
 * FFmpeg Output Parser
 *
 * Utilities for parsing FFmpeg command output: progress tracking, duration
 * extraction, log-level categorisation, and noise filtering.
 *
 * Ported from AG-Wypalarka (`src/lib/ffmpeg/ffmpeg-output-parser.ts`) with
 * one Moekoder improvement: `parseProgressPipe` consumes the structured
 * `-progress pipe:1 -nostats` stream (key=value pairs, `progress=continue`
 * sentinels) instead of the legacy stderr regex — the pipe format is more
 * accurate and stable across ffmpeg versions.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'trace';

/**
 * Legacy tagged log category returned by {@link categorizeLog}. Preserved
 * from the AG-Wypalarka port so UI code that discriminates on `success` /
 * `metadata` / `debug` tiers continues to work.
 */
export type LogType = 'info' | 'success' | 'warning' | 'error' | 'debug' | 'metadata';

export interface ParsedProgress {
  frame: number;
  fps: number;
  time: string;
  bitrate: string;
  speed: string;
  percentage: number;
  eta: string | null;
}

/**
 * Parses a time string in FFmpeg format to seconds. Accepts `HH:MM:SS.cs`,
 * `MM:SS.cs`, or a bare float.
 *
 * @param timeString - Time string
 * @returns Time in seconds
 *
 * @example
 * parseTime("01:30:45.50") // 5445.5
 * parseTime("05:30.25")    // 330.25
 */
export const parseTime = (timeString: string): number => {
  const parts = timeString.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(timeString);
};

/**
 * Extracts video duration (seconds) from an ffmpeg stderr blob. Returns
 * null if the `Duration:` line hasn't been emitted yet.
 */
export const extractDuration = (output: string): number | null => {
  const match = output.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
  return match ? parseTime(match[1]) : null;
};

/**
 * Formats seconds into a human-readable ETA (e.g. `2h 30m 15s`). Negative
 * or non-finite inputs yield `'Calculating...'` — callers render this as a
 * placeholder until the first real progress tick.
 */
export const formatETA = (seconds: number): string => {
  if (seconds < 0 || !Number.isFinite(seconds)) return 'Calculating...';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

/**
 * Categorises a log line using simple substring heuristics. Not a parser —
 * a triage bucket for the UI to tint / filter on. Order matters: errors
 * win over warnings, which win over success/metadata/debug.
 */
export const categorizeLog = (log: string): LogType => {
  const lower = log.toLowerCase();

  if (lower.includes('error') || lower.includes('failed') || lower.includes('invalid')) {
    return 'error';
  }

  if (
    lower.includes('warning') ||
    lower.includes('deprecated') ||
    (lower.includes('not found') && !lower.includes('glyph'))
  ) {
    return 'warning';
  }

  if (lower.includes('completed') || lower.includes('success') || lower.includes('done')) {
    return 'success';
  }

  if (
    lower.includes('stream') ||
    lower.includes('duration') ||
    lower.includes('encoder') ||
    lower.includes('bitrate') ||
    lower.includes('video:') ||
    lower.includes('audio:')
  ) {
    return 'metadata';
  }

  if (lower.includes('libav') || lower.includes('configuration:')) {
    return 'debug';
  }

  return 'info';
};

/**
 * Parses the legacy stderr progress line: `frame=… fps=… time=… bitrate=…
 * speed=…`. Returns null for non-progress lines. Kept for fallback when
 * ffmpeg stderr is the only available channel (older builds, debug runs).
 */
export const parseProgressLine = (
  data: string,
  totalDuration: number,
  startTime: number
): ParsedProgress | null => {
  if (!data.includes('frame=')) return null;

  const frameMatch = data.match(/frame=\s*(\d+)/);
  const fpsMatch = data.match(/fps=\s*([\d.]+)/);
  const timeMatch = data.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
  const bitrateMatch = data.match(/bitrate=\s*([\d.]+\w+\/s)/);
  const speedMatch = data.match(/speed=\s*([\d.]+x)/);

  if (!timeMatch) return null;

  const currentTime = parseTime(timeMatch[1]);
  const percentage = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  let eta: string | null = null;
  if (totalDuration > 0 && percentage > 0 && percentage < 100) {
    const elapsed = (Date.now() - startTime) / 1000;
    const estimatedTotal = elapsed / (percentage / 100);
    const remaining = estimatedTotal - elapsed;
    eta = formatETA(remaining);
  }

  return {
    frame: frameMatch ? parseInt(frameMatch[1], 10) : 0,
    fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
    time: timeMatch[1],
    bitrate: bitrateMatch ? bitrateMatch[1] : 'N/A',
    speed: speedMatch ? speedMatch[1] : 'N/A',
    percentage: Math.round(percentage * 100) / 100,
    eta,
  };
};

/**
 * Filters an ffmpeg stderr blob down to meaningful log lines — drops the
 * noisy `frame=` / `size=` progress updates that stream several times per
 * second during an encode.
 */
export const filterLogLines = (output: string): string[] =>
  output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.includes('size=') && !line.includes('frame='));

/**
 * Partial progress snapshot parsed from a single line of `-progress
 * pipe:1 -nostats` output. All fields are optional because ffmpeg emits
 * them incrementally — the caller accumulates partials into a full
 * snapshot and flushes on each `progress=continue` or `progress=end`
 * sentinel.
 *
 * Units follow ffmpeg's own conventions:
 *   - `outTimeUs`  — microseconds since stream start
 *   - `outTimeMs`  — milliseconds (redundant with `outTimeUs`; either can appear)
 *   - `bitrateKbps` — kbit/s (parsed from `bitrate=… kbits/s`)
 *   - `speed`      — multiplier (1.0 = realtime), parsed from `speed=1.23x`
 *   - `sizeBytes`  — cumulative muxer output byte count
 */
export interface PartialProgress {
  outTimeUs?: number;
  outTimeMs?: number;
  frame?: number;
  fps?: number;
  bitrateKbps?: number;
  speed?: number;
  sizeBytes?: number;
  progress?: 'continue' | 'end';
}

/**
 * Parses one line of ffmpeg's `-progress pipe:1 -nostats` output.
 *
 * Format: key=value pairs, one per line, terminated by `progress=continue`
 * or `progress=end` sentinels. `N/A` values (typical at the very start of
 * an encode) are ignored — the corresponding field stays `undefined`.
 *
 * Returns partial progress updates; caller accumulates into a full snapshot
 * and should emit on `progress=continue`/`progress=end` sentinels.
 */
export const parseProgressPipe = (line: string): PartialProgress | null => {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('=')) return null;

  const sep = trimmed.indexOf('=');
  const key = trimmed.slice(0, sep).trim();
  const value = trimmed.slice(sep + 1).trim();

  if (value === 'N/A') return null;

  switch (key) {
    case 'out_time_us':
    case 'out_time_ms': {
      // Historical wart: older ffmpeg builds emit `out_time_ms` but the
      // value is actually microseconds. Treat both keys as microseconds
      // when they appear without the newer `out_time_us` alias.
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      return { outTimeUs: num };
    }
    case 'out_time': {
      // HH:MM:SS.cs — convert to microseconds for uniformity.
      const secs = parseTime(value);
      if (!Number.isFinite(secs)) return null;
      return { outTimeUs: Math.round(secs * 1_000_000) };
    }
    case 'frame': {
      const num = parseInt(value, 10);
      return Number.isFinite(num) ? { frame: num } : null;
    }
    case 'fps': {
      const num = parseFloat(value);
      return Number.isFinite(num) ? { fps: num } : null;
    }
    case 'bitrate': {
      // Expect `XXX.Xkbits/s` (rarely `Nbits/s`).
      const match = value.match(/^([\d.]+)\s*(k|m)?bits\/s$/i);
      if (!match) return null;
      const num = parseFloat(match[1]);
      if (!Number.isFinite(num)) return null;
      const unit = (match[2] ?? '').toLowerCase();
      const kbps = unit === 'm' ? num * 1000 : unit === 'k' ? num : num / 1000;
      return { bitrateKbps: kbps };
    }
    case 'speed': {
      const match = value.match(/^([\d.]+)x?$/i);
      if (!match) return null;
      const num = parseFloat(match[1]);
      return Number.isFinite(num) ? { speed: num } : null;
    }
    case 'total_size':
    case 'size': {
      const num = Number(value);
      return Number.isFinite(num) ? { sizeBytes: num } : null;
    }
    case 'progress': {
      if (value === 'continue' || value === 'end') {
        return { progress: value };
      }
      return null;
    }
    default:
      return null;
  }
};
