/**
 * Subtitle extraction (v0.6.0) — the inverse of soft-sub muxing.
 *
 * Opens a container (MKV in practice) and writes one embedded *text* subtitle
 * track out to a standalone `.ass` / `.srt` / `.vtt` file:
 *
 *   ffmpeg -i <video> -map 0:s:<N> -c:s <copy|ass|srt> -y <out.<ext>>
 *
 * The `-c:s` token depends on the caller's chosen output format
 * ({@link ExtractSubtitleInput.format}): `'source'` copies the stream verbatim,
 * while `'ass'`/`'srt'` force that format — copying when the source already
 * matches, transcoding otherwise (anime subtitles are usually wanted as `.ass`
 * even when a track ships as SubRip). {@link resolveSubtitleOutput} owns that
 * copy-vs-transcode decision and the matching output extension.
 *
 * Listing the available tracks is already handled by `probe()` (it returns
 * `subtitleStreams[]`), so this module only owns the extract step.
 *
 * Structurally a sibling of `font-extractor.ts` — same DI seams (spawn,
 * log emission, Date.now), same "spawn ffmpeg, parse exit code, surface a
 * structured error" shape. The differences from font extraction:
 *
 *   - Subtitle extraction is mapped per-stream, so it writes to an explicit
 *     output path the caller chose (not ffmpeg's cwd).
 *   - It exits with the normal code 0 on success (no `-dump_attachment`
 *     quirk), so any non-zero exit is a genuine failure.
 *   - The output extension MUST match the *resolved* format (not necessarily
 *     the source codec) — e.g. copying an `ass` stream into a `.srt` file makes
 *     the muxer reject it. We validate the resolved extension before spawning.
 *
 * Gotchas the implementer must respect:
 *
 *   - `-map 0:s:<N>` selects the Nth *subtitle* stream (0-based among
 *     subtitles), which is cleaner than the absolute stream index ffprobe
 *     reports. Callers pass the subtitle ordinal, not the absolute index.
 *   - Image subtitles (`hdmv_pgs_subtitle`, `dvd_subtitle`) have no text
 *     representation. They are filtered out via `isTextSubtitleCodec` before
 *     a job is ever built — this module rejects them defensively too.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { LogLine } from './processor';
import {
  isTextSubtitleCodec,
  resolveSubtitleOutput,
  type SubtitleOutputFormat,
} from './subtitle-codecs';

/** Result of a successful single-track extraction. */
export interface SubtitleExtractResult {
  /** Absolute path the subtitle was written to. */
  outputPath: string;
  /** The subtitle ordinal (0-based among subtitle streams) that was copied. */
  streamIndex: number;
}

/** Test seam — production callers pass the real `spawn`. */
export interface SubtitleSpawnFn {
  (cmd: string, args: string[], options: { windowsHide?: boolean }): ChildProcess;
}

export interface ExtractSubtitleInput {
  /** Source container (MKV) holding the embedded subtitle track. */
  videoPath: string;
  /**
   * Subtitle ordinal — the 0-based position among *subtitle* streams (not the
   * absolute ffprobe stream index). Maps to `-map 0:s:<streamIndex>`.
   */
  streamIndex: number;
  /**
   * The probed codec for this stream (`codec_name` as ffprobe reports it).
   * Combined with `format` to decide whether to copy or transcode, and to
   * validate the output extension before spawning.
   */
  codec: string;
  /**
   * Desired output format. `'source'` (default) copies the stream verbatim;
   * `'ass'` / `'srt'` force that format, transcoding when the source differs.
   */
  format?: SubtitleOutputFormat;
  /** Absolute output path. Its extension MUST match the resolved output format. */
  outputPath: string;
  /** Absolute path to the ffmpeg binary. */
  ffmpegPath: string;
  /** Forwarded to the orchestrator's log channel so users see progress. */
  onLog?: (line: LogLine) => void;
  /** DI seam for tests. Optional — defaults to real spawn. */
  spawn?: SubtitleSpawnFn;
  /** Date.now seam so log timestamps are deterministic in tests. */
  now?: () => number;
}

/** Trailing extension (no leading dot, lowercased), or '' when absent. */
const extOf = (filePath: string): string => {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
};

/**
 * Build the ffmpeg arg array for a single-track extraction. `codecArg` is the
 * `-c:s` token — `'copy'` to stream-copy verbatim, or an encoder name
 * (`'ass'` / `'srt'`) to transcode. Exported for direct unit testing without
 * spawning. Paths go straight to `spawn` (no shell, no filter graph), so they
 * are passed raw — no escaping.
 */
export const buildExtractArgs = (input: {
  videoPath: string;
  streamIndex: number;
  outputPath: string;
  codecArg?: string;
}): string[] => [
  '-i',
  input.videoPath,
  '-map',
  `0:s:${input.streamIndex}`,
  '-c:s',
  input.codecArg ?? 'copy',
  '-y',
  input.outputPath,
];

/**
 * Extract a single embedded subtitle track to `outputPath`. Rejects when the
 * codec is image-based (un-extractable to text) or when the output extension
 * doesn't match the resolved output format. Copies the stream verbatim for
 * `format: 'source'`, transcodes (`-c:s ass`/`-c:s srt`) when a forced format
 * differs from the source. Throws on a non-zero ffmpeg exit.
 */
export const extractSubtitle = async (
  input: ExtractSubtitleInput
): Promise<SubtitleExtractResult> => {
  const {
    videoPath,
    streamIndex,
    codec,
    format = 'source',
    outputPath,
    ffmpegPath,
    onLog,
    spawn = nodeSpawn as unknown as SubtitleSpawnFn,
    now = () => Date.now(),
  } = input;

  if (!Number.isInteger(streamIndex) || streamIndex < 0) {
    throw new Error(
      `extractSubtitle: streamIndex must be a non-negative integer, got ${streamIndex}`
    );
  }

  if (!isTextSubtitleCodec(codec)) {
    throw new Error(
      `extractSubtitle: codec "${codec}" is not a text subtitle and cannot be extracted to a standalone file.`
    );
  }

  // Resolve copy-vs-transcode + the extension the output must use for the
  // chosen format. Non-text codecs return null (already guarded above).
  const resolved = resolveSubtitleOutput(codec, format);
  if (!resolved) {
    throw new Error(`extractSubtitle: codec "${codec}" cannot be extracted to format "${format}".`);
  }

  if (extOf(outputPath) !== resolved.ext) {
    throw new Error(
      `extractSubtitle: output extension ".${extOf(outputPath)}" does not match the chosen ` +
        `format (expected ".${resolved.ext}" for codec "${codec}" → "${format}").`
    );
  }

  const emit = (level: LogLine['level'], text: string): void => {
    onLog?.({ ts: now(), level, text });
  };

  const args = buildExtractArgs({
    videoPath,
    streamIndex,
    outputPath,
    codecArg: resolved.codecArg,
  });

  let stderrBuf = '';

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
    });

    child.on('error', err => {
      reject(err);
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (code === null) {
        reject(
          new Error(
            `ffmpeg subtitle extraction terminated by signal: ${stderrBuf.slice(-400) || '(no stderr)'}`
          )
        );
        return;
      }
      reject(
        new Error(
          `ffmpeg subtitle extraction exited with code ${code}: ${stderrBuf.slice(-400) || '(no stderr)'}`
        )
      );
    });
  });

  emit('info', `Extracted subtitle track ${streamIndex} → ${outputPath}`);

  return { outputPath, streamIndex };
};
