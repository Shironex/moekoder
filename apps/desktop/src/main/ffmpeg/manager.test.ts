import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { hashFileSha256 } from './manager';
import { getSourceForPlatform, resolveWindowsSource, MACOS_SOURCE } from './sources';
import { __resetGatesForTests } from '../http';

/* ---------------------------------------------------------------- */
/*  The Windows source resolves at runtime against the GitHub        */
/*  Releases API. Tests stub `fetch` with a representative `latest`  */
/*  release payload so they stay offline and deterministic — the     */
/*  digest below is a throwaway 64-hex string, not a real asset hash. */
/* ---------------------------------------------------------------- */

const MOCK_WINDOWS_DIGEST = 'a'.repeat(64);
const MOCK_WINDOWS_ASSET = {
  name: 'ffmpeg-n8.1-latest-win64-gpl-8.1.zip',
  browser_download_url:
    'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-gpl-8.1.zip',
  digest: `sha256:${MOCK_WINDOWS_DIGEST}`,
};

function mockGitHubRelease(assets: unknown[] = [MOCK_WINDOWS_ASSET]): void {
  __resetGatesForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ assets }),
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------- */
/*  Fixture files live in a dedicated tmp dir that the suite tears   */
/*  down on exit. We don't mock fs — the hashing path is tiny and    */
/*  real-IO tests are more trustworthy than a stubbed createHash.    */
/* ---------------------------------------------------------------- */

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moekoder-ffmpeg-test-'));

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: Buffer): string {
  const p = path.join(fixtureDir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe('getSourceForPlatform', () => {
  it('resolves the Windows source for win32 with ffmpeg + ffprobe in a single zip', async () => {
    mockGitHubRelease();
    const source = await getSourceForPlatform('win32');
    expect(source.platform).toBe('win32');
    expect(source.downloads).toHaveLength(1);
    const [dl] = source.downloads;
    expect(dl.archive).toBe('zip');
    expect(dl.entries.ffmpeg).toContain('ffmpeg.exe');
    expect(dl.entries.ffprobe).toContain('ffprobe.exe');
  });

  it('returns the macOS evermeet source for darwin with split ffmpeg/ffprobe zips', async () => {
    const source = await getSourceForPlatform('darwin');
    expect(source).toBe(MACOS_SOURCE);
    expect(source.downloads).toHaveLength(2);
    const ffmpegDl = source.downloads.find(d => d.entries.ffmpeg);
    const ffprobeDl = source.downloads.find(d => d.entries.ffprobe);
    expect(ffmpegDl?.url).toMatch(/evermeet\.cx/);
    expect(ffmpegDl?.entries.ffmpeg).toBe('ffmpeg');
    expect(ffprobeDl?.url).toMatch(/evermeet\.cx/);
    expect(ffprobeDl?.entries.ffprobe).toBe('ffprobe');
  });

  it('rejects for unsupported platforms', async () => {
    await expect(getSourceForPlatform('linux')).rejects.toThrow(/not supported on linux/i);
    await expect(getSourceForPlatform('freebsd')).rejects.toThrow(/not supported on freebsd/i);
  });

  it('resolved Windows source points at a BtbN release URL and pins the API digest', async () => {
    mockGitHubRelease();
    const source = await resolveWindowsSource();
    const [dl] = source.downloads;
    expect(dl.url).toMatch(/BtbN\/FFmpeg-Builds/);
    expect(dl.sha256).toBe(MOCK_WINDOWS_DIGEST);
    // Internal zip folder must be derived from the asset name (version-coupled).
    expect(dl.entries.ffmpeg).toBe('ffmpeg-n8.1-latest-win64-gpl-8.1/bin/ffmpeg.exe');
    expect(dl.entries.ffprobe).toBe('ffmpeg-n8.1-latest-win64-gpl-8.1/bin/ffprobe.exe');
  });

  it('Windows source does not pin a dated daily autobuild tag (BtbN prunes those)', async () => {
    // A literal `autobuild-YYYY-MM-DD-HH-MM` tag in the URL is a time-bomb:
    // BtbN deletes old dailies, so any pinned dated tag eventually 404s.
    // Allowed: the rolling `latest` tag, or a runtime-resolved URL.
    mockGitHubRelease();
    const source = await getSourceForPlatform('win32');
    for (const dl of source.downloads) {
      expect(dl.url).not.toMatch(/autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/);
    }
  });

  it('refuses to resolve the Windows source without an integrity digest', async () => {
    mockGitHubRelease([{ ...MOCK_WINDOWS_ASSET, digest: null }]);
    await expect(resolveWindowsSource()).rejects.toThrow(/integrity verification/i);
  });

  it('throws a clear error when the Windows asset is absent from the release', async () => {
    mockGitHubRelease([{ ...MOCK_WINDOWS_ASSET, name: 'some-other-asset.zip' }]);
    await expect(resolveWindowsSource()).rejects.toThrow(
      /Could not find the Windows ffmpeg asset/i
    );
  });

  it('MACOS_SOURCE pins a SHA-256 for every archive', () => {
    for (const dl of MACOS_SOURCE.downloads) {
      expect(dl.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('MACOS_SOURCE points at immutable evermeet per-version URLs', () => {
    for (const dl of MACOS_SOURCE.downloads) {
      // The rolling `getrelease/<name>/zip` endpoint must not be used —
      // it 302s to whatever build evermeet currently considers "latest"
      // and breaks the SHA-256 pin.
      expect(dl.url).not.toMatch(/getrelease/);
      expect(dl.url).toMatch(/evermeet\.cx\/ffmpeg\/(ffmpeg|ffprobe)-\d+\.\d+(\.\d+)?\.zip$/);
    }
  });

  // Opt-in network test (run with RUN_NET_TESTS=1) — proves the resolver
  // returns a live 200 asset whose API-reported digest is a real sha256.
  const net = process.env.RUN_NET_TESTS ? it : it.skip;
  net(
    'Windows source resolves to a currently-downloadable asset with a matching sha256',
    async () => {
      vi.unstubAllGlobals();
      __resetGatesForTests();
      const source = await resolveWindowsSource();
      const [dl] = source.downloads;
      expect(dl.sha256).toMatch(/^[a-f0-9]{64}$/);
      const head = await fetch(dl.url, { method: 'HEAD', redirect: 'follow' });
      expect(head.status).toBe(200);
    },
    30_000
  );
});

describe('hashFileSha256', () => {
  it('hashes an empty file to the SHA-256 of the empty string', async () => {
    const file = writeFixture('empty.bin', Buffer.alloc(0));
    const hash = await hashFileSha256(file);
    // Well-known: SHA-256("") = e3b0c442...
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches a reference hash computed in-memory for random bytes', async () => {
    const bytes = randomBytes(16 * 1024);
    const file = writeFixture('random.bin', bytes);

    const expected = createHash('sha256').update(bytes).digest('hex');
    const actual = await hashFileSha256(file);

    expect(actual).toBe(expected);
  });

  it('produces different hashes for one-bit-different inputs', async () => {
    const a = writeFixture('a.bin', Buffer.from('moekoder'));
    const b = writeFixture('b.bin', Buffer.from('Moekoder'));

    const [ha, hb] = await Promise.all([hashFileSha256(a), hashFileSha256(b)]);

    expect(ha).not.toBe(hb);
    expect(ha).toHaveLength(64);
    expect(hb).toHaveLength(64);
  });
});
