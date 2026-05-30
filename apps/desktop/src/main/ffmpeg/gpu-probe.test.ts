import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { parseEncoderList, verifyEncoderWorks, probeGpu, type SpawnFn } from './gpu-probe';

// `isInstalled` is awaited at the top of probeGpu(); stub it to true so the
// tests exercise the spawn + verification path without a real binary.
vi.mock('./manager', () => ({ isInstalled: vi.fn(async () => true) }));

/**
 * Canned fragments from real `ffmpeg -encoders` output. Each fragment has
 * the leading "V..." / "A..." / "S..." flag column so we can sanity-check
 * that our word-boundary patterns don't accidentally trip on substrings.
 */
const NVENC_ENCODERS = `
 V..... h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V..... hevc_nvenc           NVIDIA NVENC HEVC encoder (codec hevc)
 V..... av1_nvenc            NVIDIA NVENC AV1 encoder (codec av1)
`;

const QSV_ENCODERS = `
 V..... h264_qsv             H264 video (Intel Quick Sync Video acceleration) (codec h264)
 V..... hevc_qsv             HEVC (Intel Quick Sync Video acceleration) (codec hevc)
`;

const AMF_ENCODERS = `
 V..... h264_amf             AMD AMF H.264 Encoder (codec h264)
 V..... hevc_amf             AMD AMF HEVC encoder (codec hevc)
`;

const VIDEOTOOLBOX_ENCODERS = `
 V..... h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)
 V..... hevc_videotoolbox    VideoToolbox HEVC Encoder (codec hevc)
`;

const NO_HW_BANNER = `
Encoders:
 V..... = Video
 A..... = Audio
 V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V..... libx265              libx265 H.265 / HEVC (codec hevc)
 A..... aac                  AAC (Advanced Audio Coding)
`;

describe('parseEncoderList', () => {
  it('detects NVENC with all three H.264/HEVC/AV1 encoders', () => {
    const result = parseEncoderList(NVENC_ENCODERS);
    expect(result.available).toEqual(['nvenc']);
    expect(result.details.nvenc).toEqual({
      encoders: ['av1_nvenc', 'h264_nvenc', 'hevc_nvenc'],
    });
    expect(result.details.qsv).toBeNull();
    expect(result.details.amf).toBeNull();
    expect(result.details.videotoolbox).toBeNull();
  });

  it('detects Intel QSV', () => {
    const result = parseEncoderList(QSV_ENCODERS);
    expect(result.available).toEqual(['qsv']);
    expect(result.details.qsv?.encoders).toEqual(['h264_qsv', 'hevc_qsv']);
  });

  it('detects AMD AMF', () => {
    const result = parseEncoderList(AMF_ENCODERS);
    expect(result.available).toEqual(['amf']);
    expect(result.details.amf?.encoders).toEqual(['h264_amf', 'hevc_amf']);
  });

  it('detects macOS VideoToolbox', () => {
    const result = parseEncoderList(VIDEOTOOLBOX_ENCODERS);
    expect(result.available).toEqual(['videotoolbox']);
    expect(result.details.videotoolbox?.encoders).toEqual([
      'h264_videotoolbox',
      'hevc_videotoolbox',
    ]);
  });

  it('returns no vendors when only software encoders are listed', () => {
    const result = parseEncoderList(NO_HW_BANNER);
    expect(result.available).toEqual([]);
    expect(result.details.nvenc).toBeNull();
    expect(result.details.qsv).toBeNull();
    expect(result.details.amf).toBeNull();
    expect(result.details.videotoolbox).toBeNull();
  });

  it('detects multiple vendors in combined output', () => {
    const combined = NVENC_ENCODERS + QSV_ENCODERS + AMF_ENCODERS;
    const result = parseEncoderList(combined);
    expect(result.available.sort()).toEqual(['amf', 'nvenc', 'qsv']);
    expect(result.details.videotoolbox).toBeNull();
  });

  it('is resilient to empty output', () => {
    const result = parseEncoderList('');
    expect(result.available).toEqual([]);
  });

  it('does not falsely match encoder names as substrings of other tokens', () => {
    // A deliberately adversarial line that contains "nvenc" inside a longer token.
    const output = ' V..... fake_nvencoder  Not a real encoder';
    const result = parseEncoderList(output);
    expect(result.available).toEqual([]);
  });

  it('marks raw grep-only results as unverified', () => {
    expect(parseEncoderList(NVENC_ENCODERS).verified).toBe(false);
  });
});

/**
 * A fake ChildProcess with the surface probeGpu / verifyEncoderWorks touch:
 * `stdout`/`stderr` emitters, `on('error'|'close')`, and `kill`.
 *
 * `behavior` decides how the process settles:
 *  - { close: code }       → emits 'close' with `code` after a tick
 *  - { error: Error }      → emits 'error' after a tick
 *  - { hang: true }        → never settles (drives the timeout path)
 *  - { stdout: string }    → emits stdout data then closes 0 (for -encoders)
 */
function makeFakeChild(behavior: {
  close?: number;
  error?: Error;
  hang?: boolean;
  stdout?: string;
}): ReturnType<SpawnFn> {
  const child = new EventEmitter() as unknown as ReturnType<SpawnFn> & EventEmitter;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  (child as unknown as { stdout: EventEmitter }).stdout = stdout;
  (child as unknown as { stderr: EventEmitter }).stderr = stderr;
  (child as unknown as { kill: ReturnType<typeof vi.fn> }).kill = vi.fn();

  if (!behavior.hang) {
    setTimeout(() => {
      if (behavior.stdout !== undefined) {
        stdout.emit('data', Buffer.from(behavior.stdout));
      }
      if (behavior.error) {
        child.emit('error', behavior.error);
      } else {
        child.emit('close', behavior.close ?? 0);
      }
    }, 1);
  }
  return child;
}

describe('verifyEncoderWorks', () => {
  it('returns true when ffmpeg exits with code 0', async () => {
    const spawn = vi.fn(() => makeFakeChild({ close: 0 })) as unknown as SpawnFn;
    await expect(
      verifyEncoderWorks('h264_videotoolbox', { spawn, ffmpegPath: 'ffmpeg' })
    ).resolves.toBe(true);
  });

  it('returns false when ffmpeg exits non-zero (broken/unknown encoder)', async () => {
    const spawn = vi.fn(() => makeFakeChild({ close: 1 })) as unknown as SpawnFn;
    await expect(verifyEncoderWorks('h264_nvenc', { spawn, ffmpegPath: 'ffmpeg' })).resolves.toBe(
      false
    );
  });

  it('returns false and kills the process when the test-encode times out', async () => {
    const child = makeFakeChild({ hang: true });
    const spawn = vi.fn(() => child) as unknown as SpawnFn;
    const result = await verifyEncoderWorks('hevc_qsv', {
      spawn,
      ffmpegPath: 'ffmpeg',
      timeoutMs: 20,
    });
    expect(result).toBe(false);
    const killMock = (child as unknown as { kill: ReturnType<typeof vi.fn> }).kill;
    expect(killMock).toHaveBeenCalled();
  });

  it('returns false when the child emits an error event', async () => {
    const spawn = vi.fn(() =>
      makeFakeChild({ error: new Error('spawn boom') })
    ) as unknown as SpawnFn;
    await expect(verifyEncoderWorks('h264_amf', { spawn, ffmpegPath: 'ffmpeg' })).resolves.toBe(
      false
    );
  });

  it('returns false when spawn throws synchronously', async () => {
    const spawn = vi.fn(() => {
      throw new Error('ENOENT');
    }) as unknown as SpawnFn;
    await expect(verifyEncoderWorks('h264_qsv', { spawn, ffmpegPath: 'ffmpeg' })).resolves.toBe(
      false
    );
  });
});

describe('probeGpu verification + filtering', () => {
  /**
   * Builds a spawn mock that returns the canned `-encoders` output for the
   * list call, then routes each verification call through `verifyResult`,
   * keyed on the encoder name found in the `-c:v <encoder>` args.
   */
  function makeProbeSpawn(
    encoderListOutput: string,
    verifyResult: (encoder: string) => { close?: number; hang?: boolean }
  ): SpawnFn {
    return vi.fn((_cmd: string, args: readonly string[]) => {
      if (args.includes('-encoders')) {
        return makeFakeChild({ stdout: encoderListOutput, close: 0 });
      }
      const cvIndex = args.indexOf('-c:v');
      const encoder = cvIndex >= 0 ? String(args[cvIndex + 1]) : '';
      return makeFakeChild(verifyResult(encoder));
    }) as unknown as SpawnFn;
  }

  const noCache = { bypassCache: true as const };

  it('keeps working encoders and drops broken ones within a vendor', async () => {
    // h264_nvenc works; hevc_nvenc and av1_nvenc fail verification.
    const spawn = makeProbeSpawn(NVENC_ENCODERS, encoder => ({
      close: encoder === 'h264_nvenc' ? 0 : 1,
    }));
    const result = await probeGpu({ ...noCache, spawn, ffmpegPath: 'ffmpeg' });
    expect(result.available).toEqual(['nvenc']);
    expect(result.details.nvenc?.encoders).toEqual(['h264_nvenc']);
    expect(result.verified).toBe(true);
  });

  it('marks a vendor unavailable when all its encoders fail verification', async () => {
    const spawn = makeProbeSpawn(QSV_ENCODERS, () => ({ close: 1 }));
    const result = await probeGpu({ ...noCache, spawn, ffmpegPath: 'ffmpeg' });
    expect(result.available).not.toContain('qsv');
    expect(result.details.qsv).toBeNull();
    expect(result.verified).toBe(true);
  });

  it('treats a hung test-encode as a broken encoder (no startup hang)', async () => {
    // h264_videotoolbox works; hevc_videotoolbox hangs and is filtered via timeout.
    const spawn = makeProbeSpawn(VIDEOTOOLBOX_ENCODERS, encoder => ({
      close: encoder === 'h264_videotoolbox' ? 0 : undefined,
      hang: encoder === 'hevc_videotoolbox',
    }));
    const result = await probeGpu({
      ...noCache,
      spawn,
      ffmpegPath: 'ffmpeg',
      verifyTimeoutMs: 20,
    });
    expect(result.available).toEqual(['videotoolbox']);
    expect(result.details.videotoolbox?.encoders).toEqual(['h264_videotoolbox']);
  });

  it('returns all encoders when every verification passes', async () => {
    const spawn = makeProbeSpawn(NVENC_ENCODERS, () => ({ close: 0 }));
    const result = await probeGpu({ ...noCache, spawn, ffmpegPath: 'ffmpeg' });
    expect(result.details.nvenc?.encoders).toEqual(['av1_nvenc', 'h264_nvenc', 'hevc_nvenc']);
  });
});

describe('probeGpu caching', () => {
  const cachedResult = {
    available: ['videotoolbox' as const],
    details: {
      nvenc: null,
      qsv: null,
      amf: null,
      videotoolbox: { encoders: ['h264_videotoolbox'] },
    },
    verified: true,
  };

  it('returns a fresh cache hit without spawning ffmpeg', async () => {
    const spawn = vi.fn() as unknown as SpawnFn;
    const cacheGet = vi.fn(() => ({ version: 1, cachedAt: 1_000, result: cachedResult }));
    const result = await probeGpu({
      spawn,
      ffmpegPath: 'ffmpeg',
      cacheGet,
      now: () => 1_000 + 60_000, // 1 minute later — well within TTL
    });
    expect(result).toEqual(cachedResult);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('re-probes and rewrites the cache when the entry is stale', async () => {
    const spawn = vi.fn((_cmd: string, args: readonly string[]) =>
      args.includes('-encoders')
        ? makeFakeChild({ stdout: NVENC_ENCODERS, close: 0 })
        : makeFakeChild({ close: 0 })
    ) as unknown as SpawnFn;
    const cacheGet = vi.fn(() => ({ version: 1, cachedAt: 0, result: cachedResult }));
    const cacheSet = vi.fn();
    const eightDaysMs = 8 * 24 * 60 * 60 * 1_000;
    const result = await probeGpu({
      spawn,
      ffmpegPath: 'ffmpeg',
      cacheGet,
      cacheSet,
      now: () => eightDaysMs, // past the 7-day TTL
    });
    expect(spawn).toHaveBeenCalled();
    expect(result.available).toEqual(['nvenc']);
    expect(cacheSet).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, result: expect.objectContaining({ verified: true }) })
    );
  });

  it('re-probes when the cache version does not match', async () => {
    const spawn = vi.fn((_cmd: string, args: readonly string[]) =>
      args.includes('-encoders')
        ? makeFakeChild({ stdout: NVENC_ENCODERS, close: 0 })
        : makeFakeChild({ close: 0 })
    ) as unknown as SpawnFn;
    const cacheGet = vi.fn(() => ({ version: 0, cachedAt: 1_000, result: cachedResult }));
    await probeGpu({ spawn, ffmpegPath: 'ffmpeg', cacheGet, cacheSet: vi.fn(), now: () => 1_001 });
    expect(spawn).toHaveBeenCalled();
  });
});

/**
 * End-to-end check against the real bundled ffmpeg — the one seam mocks can't
 * cover: real spawn -> real `-encoders` output -> real 1-frame verify -> filter.
 * Gated to macOS + a present binary so it stays a no-op on CI without one.
 */
const REPO_FFMPEG = path.resolve(__dirname, '../../../../../bin/ffmpeg');
const hasRealFfmpeg = process.platform === 'darwin' && fs.existsSync(REPO_FFMPEG);

describe.skipIf(!hasRealFfmpeg)('probeGpu integration (real VideoToolbox)', () => {
  it('detects and verifies real VideoToolbox encoders end-to-end', async () => {
    const result = await probeGpu({ bypassCache: true, ffmpegPath: REPO_FFMPEG });
    expect(result.verified).toBe(true);
    expect(result.available).toContain('videotoolbox');
    expect(result.details.videotoolbox?.encoders.length ?? 0).toBeGreaterThan(0);
  });
});
