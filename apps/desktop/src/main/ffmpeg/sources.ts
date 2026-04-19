/**
 * Per-platform ffmpeg download sources. One entry per supported OS; the
 * `entries` map tells the extractor which paths inside the archive hold the
 * `ffmpeg` and `ffprobe` binaries so we don't have to scan the tree at
 * install time.
 */
export type FFmpegPlatform = 'win32' | 'darwin';

export interface FFmpegSource {
  platform: FFmpegPlatform;
  url: string;
  /**
   * Hex SHA-256 of the archive. `null` means trust-on-first-use — verify is
   * skipped and a warning is logged. Prefer pinning a known-good hash.
   */
  sha256: string | null;
  archive: 'zip' | 'tar.xz';
  /** Paths inside the archive for each binary — used by the extractor. */
  entries: { ffmpeg: string; ffprobe: string };
  /** Human-readable version label for display in onboarding. */
  version: string;
}

/**
 * BtbN's `latest` tag is a rolling pointer. It stays stable enough to ship
 * v0.1.0 as a trust-on-first-use source; before v0.1.0 GA we pin a specific
 * release + SHA below so we aren't vulnerable to silent upstream churn.
 *
 * TODO(phase-6-polish): pin to a specific BtbN release + sha256 before
 * v0.1.0 ships.
 */
export const WINDOWS_SOURCE: FFmpegSource = {
  platform: 'win32',
  url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
  sha256: null,
  archive: 'zip',
  entries: {
    ffmpeg: 'ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe',
    ffprobe: 'ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe',
  },
  version: 'master-latest',
};

// TODO(phase-2c): wire macOS source (evermeet.cx or OSXExperts).
export const MACOS_SOURCE: FFmpegSource | null = null;

export function getSourceForPlatform(platform: NodeJS.Platform): FFmpegSource {
  if (platform === 'win32') return WINDOWS_SOURCE;
  if (platform === 'darwin') {
    if (!MACOS_SOURCE) {
      throw new Error('macOS ffmpeg source not yet configured — pending Phase 2c');
    }
    return MACOS_SOURCE;
  }
  throw new Error(`ffmpeg auto-install not supported on ${platform}`);
}
