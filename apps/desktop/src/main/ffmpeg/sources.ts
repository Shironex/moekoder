/**
 * Per-platform ffmpeg download sources. Each source lists one or more
 * archives to pull; each archive declares which of the two binaries
 * (`ffmpeg`, `ffprobe`) it contributes. BtbN's Windows build ships both in
 * one zip; evermeet.cx splits them into two separate zips.
 *
 * The manager iterates `downloads` in order, so the progress bar advances
 * smoothly through them without the renderer needing to know the count.
 */
export type FFmpegPlatform = 'win32' | 'darwin';
export type BinaryName = 'ffmpeg' | 'ffprobe';

export interface BinaryArchive {
  url: string;
  /**
   * Hex SHA-256 of the archive. `null` means trust-on-first-use — verify is
   * skipped and a warning is logged. Prefer pinning a known-good hash.
   */
  sha256: string | null;
  archive: 'zip' | 'tar.xz';
  /**
   * Map from binary name → path inside the archive. An archive may contribute
   * one or both; the manager asserts every `BinaryName` appears exactly once
   * across the full `downloads` list.
   */
  entries: Partial<Record<BinaryName, string>>;
}

export interface FFmpegSource {
  platform: FFmpegPlatform;
  /** Human-readable version label for display in onboarding. */
  version: string;
  /** One or more archives to download & extract. */
  downloads: BinaryArchive[];
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
  version: 'master-latest',
  downloads: [
    {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      sha256: null,
      archive: 'zip',
      entries: {
        ffmpeg: 'ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe',
        ffprobe: 'ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe',
      },
    },
  ],
};

/**
 * macOS build from evermeet.cx — a long-running community-maintained source
 * of signed/notarized static ffmpeg binaries for macOS. ffmpeg and ffprobe
 * are published as separate zip archives, each containing only the matching
 * binary at the archive root.
 *
 * The `/getrelease/<name>/zip` endpoint 302s to the current release; our
 * `downloadToFile` helper follows redirects, so no extra resolve step is
 * needed.
 *
 * TODO(phase-6-polish): pin to a specific evermeet release + sha256 before
 * v0.1.0 ships — same trust-on-first-use caveat as WINDOWS_SOURCE.
 */
export const MACOS_SOURCE: FFmpegSource = {
  platform: 'darwin',
  version: 'latest',
  downloads: [
    {
      url: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
      sha256: null,
      archive: 'zip',
      entries: { ffmpeg: 'ffmpeg' },
    },
    {
      url: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
      sha256: null,
      archive: 'zip',
      entries: { ffprobe: 'ffprobe' },
    },
  ],
};

export function getSourceForPlatform(platform: NodeJS.Platform): FFmpegSource {
  if (platform === 'win32') return WINDOWS_SOURCE;
  if (platform === 'darwin') return MACOS_SOURCE;
  throw new Error(`ffmpeg auto-install not supported on ${platform}`);
}
