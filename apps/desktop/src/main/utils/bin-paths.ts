import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Resolves the directory where managed binaries (ffmpeg / ffprobe) live.
 *
 * In production this is `<userData>/bin` — on Windows that resolves to
 * `%LOCALAPPDATA%\moekoder\bin`, on macOS to
 * `~/Library/Application Support/moekoder/bin`.
 *
 * In development we walk the app path up to the monorepo root (identified by
 * a `package.json` with a `workspaces` field or the `moekoder` name) and
 * resolve to `<repoRoot>/bin`, so running `pnpm start` doesn't litter the
 * packaged userData path with dev-only binaries.
 */
export function getBinDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'bin');
  }
  let dir = app.getAppPath();
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces || pkg.name === 'moekoder') {
          return path.join(dir, 'bin');
        }
      } catch {
        // ignore parse errors and keep walking
      }
    }
    dir = path.dirname(dir);
  }
  return path.join(app.getPath('userData'), 'bin');
}

/** Windows-aware binary filename. */
function binaryName(base: 'ffmpeg' | 'ffprobe'): string {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

export function getFfmpegPath(): string {
  return path.join(getBinDir(), binaryName('ffmpeg'));
}

export function getFfprobePath(): string {
  return path.join(getBinDir(), binaryName('ffprobe'));
}
