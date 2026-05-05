import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { runBenchmark, type BenchmarkDeps } from './benchmark';

describe('runBenchmark', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'moekoder-bench-'));
  });

  afterEach(() => {
    if (existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  const makeDeps = (overrides: Partial<BenchmarkDeps> = {}): BenchmarkDeps => ({
    runEncode: vi.fn(async () => ({
      result: {
        outputPath: '/out/x.mp4',
        durationSec: 10,
        avgFps: 60,
        outputBytes: 12_345,
        elapsedMs: 0,
      },
      preflight: {
        ok: true,
        freeBytes: 1_000_000_000,
        estimatedBytes: 0,
        safetyMarginBytes: 0,
        shortfallBytes: 0,
      },
    })),
    psnrDeps: {
      // Fake spawn that emits an `average:` line and exits 0.
      spawn: () => {
        const child = new EventEmitter() as EventEmitter & {
          stderr: EventEmitter;
          kill: () => void;
        };
        child.stderr = new EventEmitter();
        child.kill = () => {};
        // Schedule the emit so listeners are attached before they fire.
        setImmediate(() => {
          child.stderr.emit(
            'data',
            Buffer.from('PSNR y:42.0 u:43.0 v:43.0 average:42.5 min:30.0 max:60.0', 'utf-8')
          );
          child.emit('close', 0);
        });
        return child as never;
      },
      getFfmpegPath: () => '/fake/ffmpeg',
    },
    getBenchmarkRoot: () => tempRoot,
    newRunId: () => 'run-test',
    now: (() => {
      let t = 1_000_000;
      return () => (t += 1234);
    })(),
    ...overrides,
  });

  it('runs each candidate sequentially and returns size/time/PSNR per row', async () => {
    const deps = makeDeps();
    const events = { onProgress: vi.fn(), onLog: vi.fn() };
    const result = await runBenchmark(
      {
        videoPath: '/in/v.mkv',
        subtitlePath: '/in/s.ass',
        candidates: [
          {
            id: 'a',
            label: 'A',
            settings: { codec: 'h264' },
            container: 'mp4',
          },
          {
            id: 'b',
            label: 'B',
            settings: { codec: 'hevc' },
            container: 'mp4',
          },
        ],
      },
      events,
      deps
    );

    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(row.sizeBytes).toBe(12_345);
      expect(row.elapsedMs).not.toBeNull();
      expect(row.elapsedMs!).toBeGreaterThan(0);
      expect(row.psnr).toBeCloseTo(42.5, 2);
      expect(row.error).toBeNull();
    }
    // Each candidate emits encoding -> measuring-psnr -> done; 3 phases × 2 candidates.
    expect(events.onProgress).toHaveBeenCalled();
  });

  it('keeps going when a single candidate fails — surfaces error in the row', async () => {
    const runEncode = vi
      .fn<NonNullable<BenchmarkDeps['runEncode']>>()
      .mockRejectedValueOnce(new Error('CANCELLED: user stopped'))
      .mockResolvedValueOnce({
        result: {
          outputPath: '/out/x.mp4',
          durationSec: 10,
          avgFps: 60,
          outputBytes: 99,
          elapsedMs: 0,
        },
        preflight: {
          ok: true,
          freeBytes: 1_000_000_000,
          estimatedBytes: 0,
          safetyMarginBytes: 0,
          shortfallBytes: 0,
        },
      });

    const deps = makeDeps({ runEncode });
    const events = { onProgress: vi.fn(), onLog: vi.fn() };
    const result = await runBenchmark(
      {
        videoPath: '/in/v.mkv',
        subtitlePath: '/in/s.ass',
        candidates: [
          { id: 'fail', label: 'Fail', settings: {}, container: 'mp4' },
          { id: 'ok', label: 'OK', settings: {}, container: 'mp4' },
        ],
      },
      events,
      deps
    );

    expect(result[0]!.error).toMatch(/CANCELLED/);
    expect(result[0]!.sizeBytes).toBeNull();
    expect(result[1]!.error).toBeNull();
    expect(result[1]!.sizeBytes).toBe(99);
  });

  it('rejects when more than 4 candidates are submitted', async () => {
    const deps = makeDeps();
    const events = { onProgress: vi.fn(), onLog: vi.fn() };
    await expect(
      runBenchmark(
        {
          videoPath: '/in/v.mkv',
          subtitlePath: '/in/s.ass',
          candidates: Array.from({ length: 5 }, (_, i) => ({
            id: String(i),
            label: String(i),
            settings: {},
            container: 'mp4' as const,
          })),
        },
        events,
        deps
      )
    ).rejects.toThrow(/at most 4/);
  });

  it('returns an empty array on zero candidates without spawning anything', async () => {
    const deps = makeDeps();
    const events = { onProgress: vi.fn(), onLog: vi.fn() };
    const result = await runBenchmark(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', candidates: [] },
      events,
      deps
    );
    expect(result).toEqual([]);
    expect(deps.runEncode).not.toHaveBeenCalled();
  });
});
