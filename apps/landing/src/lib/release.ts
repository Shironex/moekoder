/**
 * Build-time loader for the latest GitHub Release.
 *
 * Called from Astro component frontmatter (Hero, DownloadSection) to render
 * real filenames, sizes, and dates into the statically generated homepage.
 * The /download route uses a separate runtime fetch in `DownloadPage.tsx`
 * — that path stays, because it can reflect a new release before the next
 * site rebuild picks it up.
 *
 * Offline or rate-limited builds fall back to `PLACEHOLDER` so the site
 * still builds successfully. When the regex miss yields no matching asset,
 * the rendering components drop back to "Open on GitHub" rather than
 * fabricating filenames.
 */
import { GITHUB_RELEASES_API_URL, GITHUB_RELEASES_LATEST_URL } from './site';

export interface LandingReleaseAsset {
  name: string;
  size: number;
  url: string;
}

export interface LandingRelease {
  /** e.g. "0.1.0" — stripped of any leading `v`. */
  version: string;
  /** ISO date string from GitHub, or build time when falling back. */
  publishedAt: string;
  windows: LandingReleaseAsset | null;
  mac: LandingReleaseAsset | null;
  /** GitHub releases/latest page, used as a universal fallback link. */
  htmlUrl: string;
}

// electron-builder artifactName pattern: Moekoder-<ver>-<os>-<arch>.<ext>
// Mirrors apps/landing/src/components/DownloadPage.tsx so both paths resolve
// the same asset for a given release.
const WIN_PATTERN = /^Moekoder-.+-win-.+\.exe$/i;
const MAC_PATTERN = /^Moekoder-.+-mac-.+\.dmg$/i;

const PLACEHOLDER: LandingRelease = {
  version: '0.1.0',
  publishedAt: new Date().toISOString(),
  windows: null,
  mac: null,
  htmlUrl: GITHUB_RELEASES_LATEST_URL,
};

interface GithubReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  published_at: string;
  html_url: string;
  assets: GithubReleaseAsset[];
}

/**
 * Module-level promise cache so multiple components (Hero + DownloadSection)
 * share one network call per build instead of each firing their own request
 * from frontmatter.
 */
let cached: Promise<LandingRelease> | null = null;

async function fetchLatest(): Promise<LandingRelease> {
  try {
    const res = await fetch(GITHUB_RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as GithubRelease;

    const findAsset = (pattern: RegExp): LandingReleaseAsset | null => {
      const match = data.assets.find(a => pattern.test(a.name));
      if (!match) return null;
      return { name: match.name, size: match.size, url: match.browser_download_url };
    };

    return {
      version: data.tag_name.replace(/^v/i, ''),
      publishedAt: data.published_at,
      windows: findAsset(WIN_PATTERN),
      mac: findAsset(MAC_PATTERN),
      htmlUrl: data.html_url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[landing] loadLatestRelease failed, using placeholder: ${message}`);
    return PLACEHOLDER;
  }
}

export function loadLatestRelease(): Promise<LandingRelease> {
  if (!cached) cached = fetchLatest();
  return cached;
}
