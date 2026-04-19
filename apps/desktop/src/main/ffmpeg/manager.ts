import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { createMainLogger } from '../logger';
import { getFfmpegPath, getFfprobePath } from '../utils/bin-paths';

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

  // Stages filled in by subsequent commits:
  //   download -> verify -> extract -> install -> done
  throw new Error('ensureInstalled: install pipeline not yet implemented');
}
