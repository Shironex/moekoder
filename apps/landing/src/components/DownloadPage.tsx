import { useEffect, useState } from 'react';
import {
  GITHUB_RELEASES_API_URL,
  GITHUB_RELEASES_LATEST_URL,
  formatBytes,
  formatDate,
} from '../lib/site';

type Platform = 'win' | 'mac';

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface ReleaseData {
  tag_name: string;
  name?: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

interface PlatformInfo {
  key: Platform;
  os: string;
  label: string;
  extension: string;
  /** electron-builder artifactName: Moekoder-<ver>-<os>-<arch>.<ext> */
  pattern: RegExp;
}

const PLATFORMS: PlatformInfo[] = [
  {
    key: 'win',
    os: 'Windows · installer',
    label: 'win 10 · 11 · x64',
    extension: '.exe',
    pattern: /^Moekoder-.+-win-.+\.exe$/i,
  },
  {
    key: 'mac',
    os: 'macOS · disk image',
    label: 'mac 12+ · universal',
    extension: '.dmg',
    pattern: /^Moekoder-.+-mac-.+\.dmg$/i,
  },
];

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'win';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  return 'win';
}

export function DownloadPage() {
  const [release, setRelease] = useState<ReleaseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>('win');

  useEffect(() => {
    setDetectedPlatform(detectPlatform());
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(GITHUB_RELEASES_API_URL, { signal: ctrl.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ReleaseData>;
      })
      .then(setRelease)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load release');
      });
    return () => ctrl.abort();
  }, []);

  const version = release?.tag_name?.replace(/^v/i, '') ?? null;

  const getAsset = (platform: PlatformInfo): ReleaseAsset | undefined => {
    if (!release) return undefined;
    return release.assets.find(a => platform.pattern.test(a.name));
  };

  const renderEyebrow = () => {
    if (error) return <span>release feed unreachable · try GitHub</span>;
    if (!release) return <span>loading latest release…</span>;
    return (
      <>
        <span className="tag">● v{version}</span>
        released {formatDate(release.published_at)} · source available
      </>
    );
  };

  return (
    <section className="download" id="download">
      <div className="bg-kanji">焼</div>
      <div className="container">
        <div className="download-inner">
          <div className="download-eyebrow">{renderEyebrow()}</div>
          <h2>
            Get burning. <em>It's free.</em>
          </h2>
          <p>
            Download the installer for your OS. No account, no email, no "hi we've been trying to
            reach you about your car's extended warranty". Just a binary. Bring your own MKV and
            ASS.
          </p>

          <div className="platforms platforms--win">
            {error ? (
              <a
                href={GITHUB_RELEASES_LATEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="plat plat--primary plat-error"
              >
                <span className="plat-os">GitHub · Releases</span>
                <span className="plat-name">Open latest release</span>
                <span className="plat-file">direct downloads · checksums · notes</span>
                <span className="plat-arrow">↗</span>
              </a>
            ) : (
              PLATFORMS.map(p => {
                const asset = getAsset(p);
                const isPrimary = p.key === detectedPlatform;
                const href = asset?.browser_download_url ?? GITHUB_RELEASES_LATEST_URL;
                const fileName =
                  asset?.name ?? `Moekoder-${version ?? '0.1.0'}-${p.key}${p.extension}`;
                const size = asset ? formatBytes(asset.size) : '— mb';
                return (
                  <a
                    key={p.key}
                    className={
                      'plat' +
                      (isPrimary ? ' plat--primary' : '') +
                      (!release ? ' plat-skeleton' : '')
                    }
                    href={href}
                    {...(asset ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                  >
                    <span className="plat-os">{p.os}</span>
                    <span className="plat-name">{fileName}</span>
                    <span className="plat-file">
                      {p.label} · {size}
                    </span>
                    <span className="plat-arrow">{asset ? '↓' : '↗'}</span>
                  </a>
                );
              })
            )}
          </div>

          <div className="download-note">
            <span className="k">窓</span>
            <span>
              Windows is the primary target. macOS builds ship when they stabilise. Linux builds are
              on the roadmap.{' '}
              <a
                href="https://github.com/Shironex/moekoder"
                target="_blank"
                rel="noopener noreferrer"
              >
                Track progress on GitHub →
              </a>
            </span>
          </div>

          <div className="download-sub">
            <a
              href="https://github.com/Shironex/moekoder"
              target="_blank"
              rel="noopener noreferrer"
            >
              ↗ Source on GitHub
            </a>
            <a href="/changelog">↗ Release notes</a>
            <a href={GITHUB_RELEASES_LATEST_URL} target="_blank" rel="noopener noreferrer">
              ↗ All releases
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DownloadPage;
