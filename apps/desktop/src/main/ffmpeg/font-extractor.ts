/**
 * MKV embedded-font extraction (v0.5.0).
 *
 * Anime fansubs ship `\fn(CustomFont)` ASS typesetting against fonts that
 * live as MKV attachments rather than on the user's system. libass cannot
 * resolve those fonts unless the `subtitles=` filter is told where to
 * find them via the `fontsdir=<dir>` option. This module:
 *
 *   1. Spawns `ffmpeg -dump_attachment:t '' -i <video>` against a per-job
 *      temp dir to extract every attached file.
 *   2. Filters the dump to font-like files (by extension + mime hint).
 *   3. Returns the temp dir path + the kept font basenames so the
 *      orchestrator can wire `fontsdir=` and emit the missing-font
 *      diagnostic.
 *   4. Provides `cleanupFontsDir` for use on both terminal paths
 *      (onComplete + onError / cancel).
 *
 * Pure utility — no settings reads, no orchestrator coupling. The
 * orchestrator decides whether to call it (`useEmbeddedFonts` toggle
 * + `attachments.length > 0`).
 *
 * Gotchas the implementer must respect:
 *
 *   - `ffmpeg -dump_attachment:t "" -i <input>` exits with code 1 *on
 *     success* — it complains about "At least one output file must be
 *     specified" after dumping. We accept exit code 1 iff at least one
 *     attached file landed in the temp dir.
 *   - The `-dump_attachment` flag writes attachments to ffmpeg's **cwd**,
 *     not a path you pass. We MUST spawn with `cwd: tempDir`.
 *   - Some MKVs ship cover art / NFOs as attachments. Filter by font
 *     extension (`.ttf .otf .ttc .woff .woff2`) plus mime hints so cover
 *     art doesn't pollute the fontsdir libass scans.
 *   - Concurrent jobs need isolated dirs. We use `fs.mkdtemp` with a
 *     short `mkfont-` prefix to keep Windows paths under MAX_PATH.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LogLine } from './processor';
import type { ProbeAttachment } from './probe';

/** Result of a successful extraction. `null` is returned for "no work to do". */
export interface FontExtractResult {
  /** Absolute path to the per-job temp dir holding the extracted fonts. */
  dir: string;
  /** Basenames (with extension) of the font files that survived filtering. */
  fontFiles: string[];
}

/** File extensions libass can resolve as fonts. Lowercase, leading dot. */
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.woff', '.woff2']);

/** Mime-type substrings that indicate a font attachment. */
const FONT_MIME_HINTS = ['font', 'truetype', 'opentype'];

/** Test seam — production callers pass the real `spawn`. */
export interface SpawnFn {
  (cmd: string, args: string[], options: { cwd: string; windowsHide?: boolean }): ChildProcess;
}

/** Test seam — production callers pass the real `fs/promises` helpers. */
export interface FontExtractorFs {
  mkdtemp: (prefix: string) => Promise<string>;
  readdir: (dir: string) => Promise<string[]>;
  rm: (dir: string, options: { recursive: boolean; force: boolean }) => Promise<void>;
}

export interface ExtractFontsInput {
  /** Source MKV (or any container with attachments). */
  videoPath: string;
  /** Probe-reported attachments. Used to short-circuit the no-fonts case
   *  and to refine the post-extraction filter via mime-type hints. */
  attachments: ProbeAttachment[];
  /** Job id — diagnostic only, baked into log messages. */
  jobId: string;
  /** Absolute path to the ffmpeg binary. */
  ffmpegPath: string;
  /** Forwarded to the orchestrator's log channel so users see progress. */
  onLog?: (line: LogLine) => void;
  /** DI seams for tests. Optional — defaults to real spawn + fs. */
  spawn?: SpawnFn;
  fsImpl?: FontExtractorFs;
  /** Date.now seam so log timestamps are deterministic in tests. */
  now?: () => number;
  /** Override `os.tmpdir()` in tests. */
  tmpdir?: () => string;
}

const defaultFs = (): FontExtractorFs => ({
  mkdtemp: (prefix: string) => fs.mkdtemp(prefix),
  readdir: (dir: string) => fs.readdir(dir),
  rm: (dir: string, options) => fs.rm(dir, options),
});

const looksLikeFont = (filename: string, mimeType: string | undefined): boolean => {
  const ext = path.extname(filename).toLowerCase();
  if (FONT_EXTENSIONS.has(ext)) return true;
  if (!mimeType) return false;
  const lowered = mimeType.toLowerCase();
  return FONT_MIME_HINTS.some(hint => lowered.includes(hint));
};

/**
 * Pre-extraction filter: keep only attachment streams whose filename or
 * mime-type looks like a font. Stream index is preserved so callers can
 * inspect or log it. Returns the kept list — the extractor still asks
 * ffmpeg to dump every attachment (the `-dump_attachment:t ""` form has
 * no per-stream gating without per-index args), but we use this list to
 * decide whether to invoke ffmpeg at all.
 */
export const filterFontAttachments = (attachments: ProbeAttachment[]): ProbeAttachment[] =>
  attachments.filter(a => looksLikeFont(a.filename ?? '', a.mimeType));

/**
 * Extract every font-like attachment from `videoPath` into a fresh temp
 * dir. Returns `null` when there are no font-shaped attachments to dump
 * (no work, no fontsdir needed). Throws on a genuine failure (no files
 * produced, or spawn-level error).
 */
export const extractFonts = async (input: ExtractFontsInput): Promise<FontExtractResult | null> => {
  const {
    videoPath,
    attachments,
    jobId,
    ffmpegPath,
    onLog,
    spawn = nodeSpawn as unknown as SpawnFn,
    fsImpl = defaultFs(),
    now = () => Date.now(),
    tmpdir = os.tmpdir,
  } = input;

  const fontCandidates = filterFontAttachments(attachments);
  if (fontCandidates.length === 0) return null;

  const tempDir = await fsImpl.mkdtemp(path.join(tmpdir(), 'mkfont-'));

  const emit = (level: LogLine['level'], text: string): void => {
    onLog?.({ ts: now(), level, text });
  };

  // -dump_attachment writes to ffmpeg's CWD — never to a path you pass.
  // The `:t ""` empty-template tag means "use each attachment's stored
  // filename verbatim".
  const args = ['-y', '-dump_attachment:t', '', '-i', videoPath];

  let stderrBuf = '';

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { cwd: tempDir, windowsHide: true });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderrBuf += chunk.toString();
      });

      child.on('error', err => {
        reject(err);
      });

      child.on('close', (code: number | null) => {
        // ffmpeg -dump_attachment exits with code 1 even on success because
        // it complains about the missing output file after dumping. Treat
        // both 0 and 1 as candidate success — the real check is whether
        // any font files landed.
        if (code === 0 || code === 1) {
          resolve();
          return;
        }
        if (code === null) {
          reject(
            new Error(
              `ffmpeg attachment dump terminated by signal: ${stderrBuf.slice(-400) || '(no stderr)'}`
            )
          );
          return;
        }
        reject(
          new Error(
            `ffmpeg attachment dump exited with code ${code}: ${stderrBuf.slice(-400) || '(no stderr)'}`
          )
        );
      });
    });

    const allFiles = await fsImpl.readdir(tempDir);
    const fontFiles = allFiles.filter(name => {
      // Match against the probe-supplied font set when we have a filename
      // hit; otherwise fall back to extension. This handles MKVs where the
      // probe filename and the actual dumped filename agree (the common
      // case) AND oddball dumps where filenames don't survive verbatim.
      const ext = path.extname(name).toLowerCase();
      return FONT_EXTENSIONS.has(ext);
    });

    if (fontFiles.length === 0) {
      // Nothing usable landed — throw so the outer catch cleans up the
      // empty dir and re-throws to the caller.
      throw new Error(
        `Attachment dump for job ${jobId} produced no font files (candidates: ${fontCandidates.length}).`
      );
    }

    emit(
      'info',
      `Extracted ${fontFiles.length} font${fontFiles.length === 1 ? '' : 's'} from MKV attachments → ${tempDir}`
    );

    return { dir: tempDir, fontFiles };
  } catch (err) {
    await cleanupFontsDir(tempDir, fsImpl);
    throw err;
  }
};

/**
 * Remove a per-job fonts temp dir. ENOENT is swallowed so the call is
 * safe from both terminal callbacks (onComplete + onError / cancel) and
 * from cleanup paths that may race.
 */
export const cleanupFontsDir = async (
  dir: string,
  fsImpl: FontExtractorFs = defaultFs()
): Promise<void> => {
  try {
    await fsImpl.rm(dir, { recursive: true, force: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
};

// ----- v0.5.0 commit 8 — missing-font diagnostic ----------------------

/**
 * Regex matches both standard ASS `\fnFontName` and the parenthesized
 * form `\fn(FontName)` used by some tools. Standard form: name runs
 * until the next `\` or `}`; parenthesized form: name runs until `)`.
 * Group 1 = parenthesized name, group 2 = bare name.
 */
const FN_OVERRIDE_RE = /\\fn(?:\s*\(\s*([^)\\]+?)\s*\)|([^\\}]+?))(?=[\\}]|$)/g;

/**
 * Scan an ASS file's contents and return the deduplicated set of font
 * names referenced via `\fn` override tags (both standard and
 * parenthesized forms). Names are trimmed but preserved case-sensitively
 * because libass matches the same way.
 */
export const findReferencedFonts = (subtitleContents: string): string[] => {
  const out = new Set<string>();
  for (const match of subtitleContents.matchAll(FN_OVERRIDE_RE)) {
    const name = (match[1] || match[2])?.trim();
    if (name) out.add(name);
  }
  return [...out];
};

export interface DiagnoseMissingFontsInput {
  /** Parsed `\fn(...)` references from the ASS file. */
  referenced: string[];
  /** Basenames of fonts extracted from the MKV. */
  extractedFonts: string[];
  /** Forwarded log channel — emits one `warn` per missing reference. */
  onLog?: (line: LogLine) => void;
  /** Date.now seam. */
  now?: () => number;
}

/**
 * Strip the extension off a font filename and lowercase it for the
 * comparison. The font's PostScript / family name is what `\fn(...)`
 * references in practice; the file's stem agrees with the family name
 * for the vast majority of fansub-shipped fonts. This isn't perfect —
 * a `FontFamily-Bold.ttf` advertises family `FontFamily` but our scan
 * sees the stem — but it's a soft warning and false negatives ("we
 * thought you had it") are worse than false positives ("we warned
 * about a font you actually have"), so we keep the comparison narrow.
 */
const fontStem = (basename: string): string => path.parse(basename).name.toLowerCase();

/**
 * Diff the set of fonts an ASS file references via `\fn(...)` overrides
 * against the set of fonts we extracted from the MKV. Emit a `warn`
 * per missing reference so the user sees it in the job log.
 */
export const diagnoseMissingFonts = (input: DiagnoseMissingFontsInput): string[] => {
  const { referenced, extractedFonts, onLog, now = () => Date.now() } = input;

  const haveStems = new Set(extractedFonts.map(fontStem));
  const missing = referenced.filter(name => !haveStems.has(name.toLowerCase()));

  for (const name of missing) {
    onLog?.({
      ts: now(),
      level: 'warn',
      text: `Subtitle references font "${name}" which is not in MKV attachments — libass will fall back to the system default if it isn't installed.`,
    });
  }

  return missing;
};
