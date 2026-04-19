import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { createMainLogger } from '../logger';
import { downloadToFile } from '../http';
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
 * Ensures ffmpeg + ffprobe are installed under `<userData>/bin`. No-op if
 * both binaries are already present. Download / verify / extract stages are
 * filled in by later commits.
 */
export async function ensureInstalled(onProgress: ProgressCallback): Promise<void> {
  if (await isInstalled()) {
    onProgress({ stage: 'done', pct: 1, message: 'ffmpeg already installed' });
    return;
  }

  onProgress({ stage: 'resolving', pct: 0, message: 'Resolving ffmpeg source' });
  const source = getSourceForPlatform(process.platform);

  fs.mkdirSync(getBinDir(), { recursive: true });

  const archivePath = await downloadArchive(source, onProgress);

  // Verify / extract / install stages filled in by subsequent commits.
  void archivePath;
  throw new Error('ensureInstalled: verify/extract/install stages not yet implemented');
}
