/**
 * Per-platform ffmpeg download sources. Each source lists one or more
 * archives to pull; each archive declares which of the two binaries
 * (`ffmpeg`, `ffprobe`) it contributes. BtbN's Windows build ships both in
 * one zip; evermeet.cx splits them into two separate zips.
 *
 * The manager iterates `downloads` in order, so the progress bar advances
 * smoothly through them without the renderer needing to know the count.
 */
import { fetchGitHubJson } from '../http';

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
 * BtbN publishes Windows ffmpeg builds as GitHub releases. The bytes behind a
 * given asset URL are byte-stable, BUT the *availability* of a dated
 * `autobuild-YYYY-MM-DD-HH-MM` tag is not: BtbN prunes old daily autobuilds on
 * a rolling schedule, so any pinned dated tag eventually 404s. (An earlier
 * version of this file pinned such a tag and broke onboarding once BtbN
 * deleted it.) We therefore resolve at runtime against the permanent rolling
 * `latest` tag and pin the SHA-256 reported by the GitHub Releases API's
 * per-asset `digest` field — keeping supply-chain verification without
 * depending on a tag that can disappear.
 */
const WINDOWS_RELEASE_API = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest';

/**
 * Asset published on the rolling `latest` tag. The filename is stable across
 * rebuilds (the version is literally `latest`), and the zip's top-level folder
 * matches the filename minus `.zip`, so `entries` can be derived from it.
 */
const WINDOWS_ASSET_NAME = 'ffmpeg-n8.1-latest-win64-gpl-8.1.zip';

/** Subset of the GitHub Releases API response we consume. */
interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  /** Upload-time digest, formatted `sha256:<hex>` (GitHub feature, 2025-06).  */
  digest?: string | null;
}
interface GitHubReleaseResponse {
  assets?: GitHubReleaseAsset[];
}

/**
 * Resolve the Windows ffmpeg source at runtime from the GitHub Releases API.
 *
 * Queries the BtbN `latest` release, selects the stable win64 GPL asset, and
 * builds a `BinaryArchive` from its download URL, API-reported `digest`, and
 * the `entries` derived from the asset's top-level folder. Throws a clear,
 * actionable error on any failure (network, missing asset, missing digest)
 * rather than degrading to an unverified download — verification is never
 * silently dropped.
 */
export async function resolveWindowsSource(): Promise<FFmpegSource> {
  let release: GitHubReleaseResponse;
  try {
    release = await fetchGitHubJson<GitHubReleaseResponse>(WINDOWS_RELEASE_API);
  } catch (err) {
    throw new Error(
      `Failed to resolve the Windows ffmpeg download from the GitHub Releases API ` +
        `(${WINDOWS_RELEASE_API}). Check your internet connection and try again.`,
      { cause: err }
    );
  }

  const asset = release.assets?.find(a => a.name === WINDOWS_ASSET_NAME);
  if (!asset) {
    throw new Error(
      `Could not find the Windows ffmpeg asset "${WINDOWS_ASSET_NAME}" on the BtbN ` +
        `latest release. The build layout may have changed; please report this.`
    );
  }

  const digest = asset.digest ?? '';
  const sha256 = digest.startsWith('sha256:') ? digest.slice('sha256:'.length) : '';
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    throw new Error(
      `The GitHub Releases API did not report a usable sha256 digest for ` +
        `"${WINDOWS_ASSET_NAME}". Refusing to download without integrity verification.`
    );
  }

  // The zip's top-level folder matches the asset name minus `.zip`.
  const folder = asset.name.replace(/\.zip$/, '');

  return {
    platform: 'win32',
    version: 'n8.1 (latest)',
    downloads: [
      {
        url: asset.browser_download_url,
        sha256: sha256.toLowerCase(),
        archive: 'zip',
        entries: {
          ffmpeg: `${folder}/bin/ffmpeg.exe`,
          ffprobe: `${folder}/bin/ffprobe.exe`,
        },
      },
    ],
  };
}

/**
 * macOS build from evermeet.cx — a long-running community-maintained source
 * of signed/notarized static ffmpeg binaries for macOS. ffmpeg and ffprobe
 * are published as separate zip archives, each containing only the matching
 * binary at the archive root.
 *
 * Pinned to ffmpeg/ffprobe 8.1 — the immutable per-version URLs are taken
 * from `https://evermeet.cx/ffmpeg/info/{ffmpeg,ffprobe}/release` (the
 * `download.zip.url` field), so the archive behind the URL stays
 * byte-stable. SHA-256s are computed over the downloaded `.zip` artifacts
 * because evermeet's JSON ships a PGP `.sig` only (not a hex digest); to
 * bump, download the new versioned zip and run `sha256sum` against it.
 */
export const MACOS_SOURCE: FFmpegSource = {
  platform: 'darwin',
  version: '8.1',
  downloads: [
    {
      url: 'https://evermeet.cx/ffmpeg/ffmpeg-8.1.zip',
      sha256: 'd67db25908eff64b7d0eaa73784f0c55728d9e036a96931095fcf8e8968eefab',
      archive: 'zip',
      entries: { ffmpeg: 'ffmpeg' },
    },
    {
      url: 'https://evermeet.cx/ffmpeg/ffprobe-8.1.zip',
      sha256: 'b6e9bf4f4ab2992dace205498d99d9e2ede684e3e8ae89485cadd3b91711ea04',
      archive: 'zip',
      entries: { ffprobe: 'ffprobe' },
    },
  ],
};

/**
 * Resolve the ffmpeg source for a platform. macOS is a static pin; Windows is
 * resolved at runtime from the GitHub Releases API (see `resolveWindowsSource`).
 * Async so both paths share one awaitable call site in the manager.
 */
export async function getSourceForPlatform(platform: NodeJS.Platform): Promise<FFmpegSource> {
  if (platform === 'win32') return resolveWindowsSource();
  if (platform === 'darwin') return MACOS_SOURCE;
  throw new Error(`ffmpeg auto-install not supported on ${platform}`);
}
