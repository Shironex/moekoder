import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { hashFileSha256 } from './manager';
import { getSourceForPlatform, WINDOWS_SOURCE, MACOS_SOURCE } from './sources';

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
  it('returns the Windows source for win32', () => {
    const source = getSourceForPlatform('win32');
    expect(source).toBe(WINDOWS_SOURCE);
    expect(source.archive).toBe('zip');
    expect(source.entries.ffmpeg).toContain('ffmpeg.exe');
    expect(source.entries.ffprobe).toContain('ffprobe.exe');
  });

  it('throws a clear error for darwin until Phase 2c wires MACOS_SOURCE', () => {
    // Sanity check: if the macOS source is wired in a future phase, this test
    // will fail and force the assertions to be updated.
    expect(MACOS_SOURCE).toBeNull();
    expect(() => getSourceForPlatform('darwin')).toThrow(/macOS.*Phase 2c/i);
  });

  it('throws for unsupported platforms', () => {
    expect(() => getSourceForPlatform('linux')).toThrow(/not supported on linux/i);
    expect(() => getSourceForPlatform('freebsd')).toThrow(/not supported on freebsd/i);
  });

  it('WINDOWS_SOURCE points at a BtbN release URL', () => {
    expect(WINDOWS_SOURCE.url).toMatch(/BtbN\/FFmpeg-Builds/);
  });
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
