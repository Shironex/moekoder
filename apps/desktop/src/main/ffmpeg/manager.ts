import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { createMainLogger } from '../logger';
import { downloadToFile } from '../http';
import { getBinDir, getFfmpegPath, getFfprobePath } from '../utils/bin-paths';
import {
  getSourceForPlatform,
  type BinaryArchive,
  type BinaryName,
  type FFmpegSource,
} from './sources';

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
 * Delete the installed ffmpeg + ffprobe binaries from `<binDir>`. Used by
 * the eventual "repair / reinstall" Settings flow — callers should prompt
 * before invoking. Swallows ENOENT so calling it on a fresh install is a
 * harmless no-op.
 */
export async function removeInstalled(): Promise<void> {
  for (const p of [getFfmpegPath(), getFfprobePath()]) {
    try {
      fs.rmSync(p, { force: true });
      log.info(`[remove] unlinked ${p}`);
    } catch (err) {
      log.warn(`[remove] failed to unlink ${p}`, err);
    }
  }
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
 * Stage weights inside a single archive's download pipeline — must sum to 1
 * minus the tiny `installing` slice we add once at the very end. Downloading
 * is by far the largest real-world cost so it dominates the bar.
 */
const INSTALL_TAIL = 0.02;
const PER_ARCHIVE_WEIGHTS = {
  downloading: 0.8,
  verifying: 0.08,
  extracting: 0.12,
} as const;

function resolveTmpArchivePath(cfg: BinaryArchive): string {
  const tmpDir = path.join(app.getPath('userData'), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const suffix = cfg.archive === 'zip' ? 'zip' : 'tar.xz';
  const token = randomBytes(8).toString('hex');
  return path.join(tmpDir, `ffmpeg-${token}.${suffix}`);
}

/** Pretty label like `"ffmpeg"` or `"ffmpeg + ffprobe"` for progress messages. */
function describeArchive(cfg: BinaryArchive): string {
  return Object.keys(cfg.entries).join(' + ');
}

/**
 * Download one archive to a random path under `<userData>/tmp`. Progress
 * events are rescaled into the overall `downloading` slice for this archive
 * so the caller sees a smooth band for its slot.
 */
async function downloadArchive(
  cfg: BinaryArchive,
  source: FFmpegSource,
  slotBase: number,
  slotSize: number,
  onProgress: ProgressCallback
): Promise<string> {
  const tmpPath = resolveTmpArchivePath(cfg);
  const label = describeArchive(cfg);
  onProgress({
    stage: 'downloading',
    pct: slotBase,
    message: `Downloading ${label} (${source.version})`,
  });

  try {
    await downloadToFile(cfg.url, tmpPath, pct => {
      onProgress({
        stage: 'downloading',
        pct: slotBase + (pct / 100) * slotSize * PER_ARCHIVE_WEIGHTS.downloading,
        message: `Downloading ${label} (${pct}%)`,
      });
    });
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }

  log.info(`downloaded ${cfg.url} -> ${tmpPath}`);
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
 * archive's `sha256` is `null` (trust-on-first-use), verify is skipped with a
 * warning — BtbN's `latest` tag and evermeet.cx's `getrelease` endpoint are
 * rolling pointers we can't pin yet; we'll swap them for tagged releases
 * before v0.1.0 GA.
 */
async function verifyArchive(
  archivePath: string,
  cfg: BinaryArchive,
  slotBase: number,
  slotSize: number,
  onProgress: ProgressCallback
): Promise<void> {
  const verifyEnd =
    slotBase + slotSize * (PER_ARCHIVE_WEIGHTS.downloading + PER_ARCHIVE_WEIGHTS.verifying);

  if (!cfg.sha256) {
    log.warn(`[verify] source ${cfg.url} has no pinned sha256 — skipping hash verification`);
    onProgress({
      stage: 'verifying',
      pct: verifyEnd,
      message: 'Skipping hash verification (no pinned SHA)',
    });
    return;
  }

  onProgress({
    stage: 'verifying',
    pct: slotBase + slotSize * PER_ARCHIVE_WEIGHTS.downloading,
    message: 'Verifying SHA-256',
  });
  const actual = await hashFileSha256(archivePath);
  const expected = cfg.sha256.toLowerCase();
  if (actual.toLowerCase() !== expected) {
    throw new Error(
      `SHA-256 mismatch for downloaded ffmpeg archive. expected=${expected} actual=${actual}`
    );
  }
  log.info(`[verify] sha256 ok (${actual})`);
  onProgress({
    stage: 'verifying',
    pct: verifyEnd,
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

/** Destination on disk for each logical binary name. */
function destPathFor(name: BinaryName): string {
  return name === 'ffmpeg' ? getFfmpegPath() : getFfprobePath();
}

/**
 * Walk every entry in the zip once, piping the archive paths named in
 * `cfg.entries` to their destinations under `binDir`. Other entries are
 * skipped — BtbN ships a large tree of docs/licences we don't need.
 */
async function extractBinariesFromZip(archivePath: string, cfg: BinaryArchive): Promise<void> {
  const targets = new Map<string, string>();
  for (const [name, entryPath] of Object.entries(cfg.entries)) {
    if (!entryPath) continue;
    targets.set(entryPath, destPathFor(name as BinaryName));
  }
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
}

/**
 * Extract stage: pull the binary entries out of the zip into `<binDir>`.
 * The executable bit is set once at the end of `ensureInstalled`, after
 * every archive has been extracted.
 */
async function extractArchive(
  archivePath: string,
  cfg: BinaryArchive,
  slotBase: number,
  slotSize: number,
  onProgress: ProgressCallback
): Promise<void> {
  const extractStart =
    slotBase + slotSize * (PER_ARCHIVE_WEIGHTS.downloading + PER_ARCHIVE_WEIGHTS.verifying);
  const extractEnd = slotBase + slotSize;

  onProgress({
    stage: 'extracting',
    pct: extractStart,
    message: `Extracting ${describeArchive(cfg)}`,
  });

  if (cfg.archive !== 'zip') {
    throw new Error(`unsupported archive type for extractor: ${cfg.archive}`);
  }

  await extractBinariesFromZip(archivePath, cfg);

  onProgress({
    stage: 'extracting',
    pct: extractEnd,
    message: 'Extraction complete',
  });
}

/**
 * Fail fast if a source's `downloads` don't collectively contribute both
 * `ffmpeg` and `ffprobe`, or if one binary is declared more than once.
 * Catches misconfiguration at install time instead of "mysteriously missing
 * binary" at run time.
 */
function assertSourceCoversBothBinaries(source: FFmpegSource): void {
  const seen = new Set<BinaryName>();
  for (const dl of source.downloads) {
    for (const name of Object.keys(dl.entries) as BinaryName[]) {
      if (seen.has(name)) {
        throw new Error(`ffmpeg source for ${source.platform}: binary ${name} declared twice`);
      }
      seen.add(name);
    }
  }
  for (const required of ['ffmpeg', 'ffprobe'] as BinaryName[]) {
    if (!seen.has(required)) {
      throw new Error(`ffmpeg source for ${source.platform}: missing ${required} entry`);
    }
  }
}

/**
 * Ensures ffmpeg + ffprobe are installed under `<userData>/bin`. No-op if
 * both binaries are already present. Runs the full pipeline: resolve ->
 * (download -> verify -> extract) per archive -> install. Each archive gets
 * an equal slot of the `[0, 1 - INSTALL_TAIL]` progress band.
 */
export async function ensureInstalled(onProgress: ProgressCallback): Promise<void> {
  if (await isInstalled()) {
    onProgress({ stage: 'done', pct: 1, message: 'ffmpeg already installed' });
    return;
  }

  onProgress({ stage: 'resolving', pct: 0, message: 'Resolving ffmpeg source' });
  const source = getSourceForPlatform(process.platform);
  assertSourceCoversBothBinaries(source);

  fs.mkdirSync(getBinDir(), { recursive: true });

  const perSlot = (1 - INSTALL_TAIL) / source.downloads.length;

  for (let i = 0; i < source.downloads.length; i++) {
    const cfg = source.downloads[i];
    const slotBase = i * perSlot;

    const archivePath = await downloadArchive(cfg, source, slotBase, perSlot, onProgress);
    try {
      await verifyArchive(archivePath, cfg, slotBase, perSlot, onProgress);
      await extractArchive(archivePath, cfg, slotBase, perSlot, onProgress);
    } catch (err) {
      fs.rmSync(archivePath, { force: true });
      throw err;
    }
    fs.rmSync(archivePath, { force: true });
  }

  if (process.platform !== 'win32') {
    fs.chmodSync(getFfmpegPath(), 0o755);
    fs.chmodSync(getFfprobePath(), 0o755);
  }

  onProgress({
    stage: 'installing',
    pct: 1 - INSTALL_TAIL,
    message: 'ffmpeg installed',
  });
  onProgress({ stage: 'done', pct: 1, message: 'ffmpeg ready' });
  log.info(`[install] ffmpeg + ffprobe installed to ${getBinDir()}`);
}
