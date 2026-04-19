import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { createMainLogger } from '../logger';
import { downloadToFile } from '../http';
import { IpcError } from '../ipc/errors';
import { getBinDir, getFfmpegPath, getFfprobePath } from '../utils/bin-paths';
import { getSourceForPlatform, type FFmpegSource } from './sources';

const log = createMainLogger('ffmpeg/manager');

/** Phases emitted by `ensureInstalled` — one logical step per stage. */
export type InstallStage =
  | 'resolving'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'done';

export interface InstallProgress {
  stage: InstallStage;
  /** Monotonically increasing across the whole install, 0..1. */
  pct: number;
  downloadedBytes?: number;
  totalBytes?: number;
  /** English progress label; renderer localises at display time. */
  message?: string;
}

export type ProgressCallback = (p: InstallProgress) => void;

/** Both binaries must exist for the install to count as complete. */
export async function isInstalled(): Promise<boolean> {
  return fs.existsSync(getFfmpegPath()) && fs.existsSync(getFfprobePath());
}

/**
 * Returns the ffmpeg binary's version string (e.g. `"N-xxxxx-g..."`) by
 * running `ffmpeg -version` and parsing the first line. Returns `null` if
 * the binary is missing or the spawn fails — never throws, version probing
 * is best-effort.
 */
export async function getInstalledVersion(): Promise<string | null> {
  if (!(await isInstalled())) return null;

  return new Promise(resolve => {
    const child = execFile(getFfmpegPath(), ['-version'], { timeout: 10_000 }, (err, stdout) => {
      if (err) {
        log.warn('getInstalledVersion failed', err.message);
        resolve(null);
        return;
      }
      const firstLine = stdout.split('\n')[0] ?? '';
      const match = firstLine.match(/ffmpeg version\s+(\S+)/);
      resolve(match ? match[1] : firstLine.trim() || null);
    });
    child.on('error', () => resolve(null));
  });
}

/**
 * Stage weights inside `ensureInstalled` — must sum to 1. Downloading is by
 * far the largest real-world cost so it dominates the bar.
 */
const STAGE_WEIGHTS = {
  downloading: 0.8,
  verifying: 0.08,
  extracting: 0.1,
  installing: 0.02,
} as const;

function resolveTmpArchivePath(source: FFmpegSource): string {
  const tmpDir = path.join(app.getPath('userData'), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const suffix = source.archive === 'zip' ? 'zip' : 'tar.xz';
  const token = randomBytes(8).toString('hex');
  return path.join(tmpDir, `ffmpeg-${token}.${suffix}`);
}

/**
 * Download the source archive to a random path under `<userData>/tmp`.
 * Progress events are rescaled into the overall `downloading` slice so the
 * caller sees a smooth 0..0.8 band during this stage.
 */
async function downloadArchive(
  source: FFmpegSource,
  onProgress: ProgressCallback
): Promise<string> {
  const tmpPath = resolveTmpArchivePath(source);
  onProgress({
    stage: 'downloading',
    pct: 0,
    message: `Downloading ffmpeg (${source.version})`,
  });

  try {
    await downloadToFile(source.url, tmpPath, pct => {
      onProgress({
        stage: 'downloading',
        pct: (pct / 100) * STAGE_WEIGHTS.downloading,
        message: `Downloading ffmpeg (${pct}%)`,
      });
    });
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }

  log.info(`downloaded ${source.url} -> ${tmpPath}`);
  return tmpPath;
}

/**
 * Hex-encoded SHA-256 of a file, computed by streaming — never loads the
 * whole archive into memory. Exported for unit tests.
 */
export async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

/**
 * Verify the downloaded archive against the pinned SHA-256 from the source
 * config. Mismatches throw so the caller can discard the archive. When the
 * source's `sha256` is `null` (trust-on-first-use), verify is skipped with a
 * warning — this path exists because BtbN's `latest` tag is a rolling pointer
 * we can't pin yet; we'll swap it for a tagged release before v0.1.0 GA.
 */
async function verifyArchive(
  archivePath: string,
  source: FFmpegSource,
  onProgress: ProgressCallback
): Promise<void> {
  const base = STAGE_WEIGHTS.downloading;

  if (!source.sha256) {
    log.warn(`[verify] source ${source.url} has no pinned sha256 — skipping hash verification`);
    onProgress({
      stage: 'verifying',
      pct: base + STAGE_WEIGHTS.verifying,
      message: 'Skipping hash verification (no pinned SHA)',
    });
    return;
  }

  onProgress({ stage: 'verifying', pct: base, message: 'Verifying SHA-256' });
  const actual = await hashFileSha256(archivePath);
  const expected = source.sha256.toLowerCase();
  if (actual.toLowerCase() !== expected) {
    throw new Error(
      `SHA-256 mismatch for downloaded ffmpeg archive. expected=${expected} actual=${actual}`
    );
  }
  log.info(`[verify] sha256 ok (${actual})`);
  onProgress({
    stage: 'verifying',
    pct: base + STAGE_WEIGHTS.verifying,
    message: 'SHA-256 verified',
  });
}

/**
 * Open a zip archive with yauzl. Promisified to play nicely with the rest
 * of the async install pipeline.
 */
function openZip(archivePath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(err ?? new Error(`Failed to open zip: ${archivePath}`));
        return;
      }
      resolve(zip);
    });
  });
}

/**
 * Walk every entry in the zip once, piping the two archive paths named in
 * `source.entries` to their destinations under `binDir`. Other entries are
 * skipped — BtbN ships a large tree of docs and licences we don't need.
 */
async function extractBinariesFromZip(
  archivePath: string,
  source: FFmpegSource,
  binDir: string
): Promise<void> {
  const targets = new Map<string, string>([
    [source.entries.ffmpeg, getFfmpegPath()],
    [source.entries.ffprobe, getFfprobePath()],
  ]);
  const found = new Set<string>();

  const zip = await openZip(archivePath);

  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => {
      if (found.size < targets.size) {
        const missing = [...targets.keys()].filter(k => !found.has(k));
        reject(new Error(`Zip missing expected entries: ${missing.join(', ')}`));
        return;
      }
      resolve();
    });

    zip.on('entry', (entry: Entry) => {
      const dest = targets.get(entry.fileName);
      if (!dest) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (streamErr, readStream) => {
        if (streamErr || !readStream) {
          reject(streamErr ?? new Error(`Failed to read entry ${entry.fileName}`));
          return;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const writeStream = fs.createWriteStream(dest);
        readStream.pipe(writeStream);
        writeStream.on('close', () => {
          found.add(entry.fileName);
          zip.readEntry();
        });
        writeStream.on('error', reject);
        readStream.on('error', reject);
      });
    });

    zip.readEntry();
  });

  void binDir;
}

/**
 * Extract stage: pull only the ffmpeg/ffprobe entries out of the zip into
 * `<binDir>`, then set the executable bit on Unix. Windows already marks
 * `.exe` files executable via the file extension.
 */
async function extractArchive(
  archivePath: string,
  source: FFmpegSource,
  onProgress: ProgressCallback
): Promise<void> {
  const base = STAGE_WEIGHTS.downloading + STAGE_WEIGHTS.verifying;
  onProgress({
    stage: 'extracting',
    pct: base,
    message: 'Extracting ffmpeg archive',
  });

  if (source.archive !== 'zip') {
    throw new Error(`unsupported archive type for extractor: ${source.archive}`);
  }

  await extractBinariesFromZip(archivePath, source, getBinDir());

  if (process.platform !== 'win32') {
    fs.chmodSync(getFfmpegPath(), 0o755);
    fs.chmodSync(getFfprobePath(), 0o755);
  }

  onProgress({
    stage: 'extracting',
    pct: base + STAGE_WEIGHTS.extracting,
    message: 'Extraction complete',
  });
}

/**
 * Ensures ffmpeg + ffprobe are installed under `<userData>/bin`. No-op if
 * both binaries are already present. Runs the full pipeline: resolve ->
 * download -> verify -> extract -> install.
 */
export async function ensureInstalled(onProgress: ProgressCallback): Promise<void> {
  if (await isInstalled()) {
    onProgress({ stage: 'done', pct: 1, message: 'ffmpeg already installed' });
    return;
  }

  onProgress({ stage: 'resolving', pct: 0, message: 'Resolving ffmpeg source' });
  // TODO(phase-2c): drop this darwin guard once MACOS_SOURCE is wired.
  // The macOS download path depends on evermeet.cx / OSXExperts selection +
  // a pinned SHA; until that lands we fail fast with a structured error so
  // the renderer can show a friendly "download ffmpeg manually" fallback.
  if (process.platform === 'darwin') {
    throw new IpcError('NOT_IMPLEMENTED', 'macOS ffmpeg auto-install lands in Phase 2c');
  }
  const source = getSourceForPlatform(process.platform);

  fs.mkdirSync(getBinDir(), { recursive: true });

  const archivePath = await downloadArchive(source, onProgress);

  try {
    await verifyArchive(archivePath, source, onProgress);
    await extractArchive(archivePath, source, onProgress);
  } catch (err) {
    fs.rmSync(archivePath, { force: true });
    throw err;
  }

  fs.rmSync(archivePath, { force: true });

  onProgress({
    stage: 'installing',
    pct:
      STAGE_WEIGHTS.downloading +
      STAGE_WEIGHTS.verifying +
      STAGE_WEIGHTS.extracting +
      STAGE_WEIGHTS.installing,
    message: 'ffmpeg installed',
  });
  onProgress({ stage: 'done', pct: 1, message: 'ffmpeg ready' });
  log.info(`[install] ffmpeg + ffprobe installed to ${getBinDir()}`);
}
