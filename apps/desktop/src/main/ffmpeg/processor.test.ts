import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { FFmpegProcessor, type EncodeProgress, type LogLine } from './processor';
import { BALANCED_PRESET } from './settings';
import type { EncodeJob } from './args';

/**
 * Minimal stand-in for `child_process.ChildProcess` that lets tests drive
 * stdout/stderr and emit `close`/`error` events synchronously. Adequate for
 * the spawn seam because the processor only reads streams + listens for
 * `close`/`error`/`kill`; it never pokes at pid, stdin, or the other child
 * API surface.
 */
class MockChild extends EventEmitter {
  readonly stdout = new Readable({ read() {} });
  readonly stderr = new Readable({ read() {} });
  killCalls: NodeJS.Signals[] = [];

  pushStdout(chunk: string): void {
    this.stdout.push(Buffer.from(chunk, 'utf-8'));
  }

  pushStderr(chunk: string): void {
    this.stderr.push(Buffer.from(chunk, 'utf-8'));
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    if (typeof signal === 'string') this.killCalls.push(signal);
    return true;
  }

  close(code: number | null): void {
    this.stdout.push(null);
    this.stderr.push(null);
    this.emit('close', code);
  }

  asChild(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

const makeJob = (overrides: Partial<EncodeJob> = {}): EncodeJob => ({
  videoPath: '/in/video.mkv',
  subtitlePath: '/in/sub.ass',
  outputPath: '/out/video.mp4',
  settings: BALANCED_PRESET,
  ...overrides,
});

let now = 1000;

const makeDeps = (child: MockChild, overrides: Partial<Record<string, unknown>> = {}) => ({
  spawn: vi.fn((_cmd: string, _args: string[]) => child.asChild()),
  getFfmpegPath: vi.fn(() => '/bin/ffmpeg'),
  probeDuration: vi.fn(async () => 60),
  probeAudioCodec: vi.fn(async () => 'aac'),
  unlink: vi.fn(async () => undefined),
  statSize: vi.fn(async () => 12_345),
  now: vi.fn(() => now),
  ...overrides,
});

/**
 * Drains the microtask queue until `spawn` has been called — the processor
 * performs async probes before it touches `spawn`, so pushing stdio events
 * before that point would race.
 */
const waitForSpawn = async (deps: ReturnType<typeof makeDeps>): Promise<void> => {
  for (let i = 0; i < 50; i++) {
    if (deps.spawn.mock.calls.length > 0) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('timed out waiting for spawn');
};

beforeEach(() => {
  now = 1000;
});

describe('FFmpegProcessor.run() — progress + completion', () => {
  it('emits onProgress on each `progress=continue` sentinel and onComplete on code=0', async () => {
    const child = new MockChild();
    const deps = makeDeps(child);
    const progresses: EncodeProgress[] = [];
    const logs: LogLine[] = [];

    const proc = new FFmpegProcessor(
      makeJob(),
      {
        onProgress: p => progresses.push(p),
        onLog: l => logs.push(l),
      },
      deps
    );

    const runPromise = proc.run();
    await waitForSpawn(deps);

    // First progress tick at 50% through a 60s source.
    child.pushStdout(
      [
        'frame=720',
        'fps=120',
        'bitrate=1500.0kbits/s',
        'total_size=10485760',
        'out_time_us=30000000',
        'speed=2.0x',
        'progress=continue',
        '',
      ].join('\n')
    );

    // Second tick at the end.
    child.pushStdout(
      [
        'frame=1440',
        'fps=120',
        'bitrate=1450.0kbits/s',
        'total_size=21000000',
        'out_time_us=60000000',
        'speed=2.0x',
        'progress=end',
        '',
      ].join('\n')
    );

    // Wait for the async data handlers to drain.
    await new Promise(resolve => setImmediate(resolve));

    now = 31_000; // 30s of encode wall time
    child.close(0);

    const result = await runPromise;

    expect(progresses).toHaveLength(2);
    expect(progresses[0].pct).toBeCloseTo(50, 1);
    expect(progresses[0].outTimeSec).toBeCloseTo(30, 2);
    expect(progresses[0].speed).toBe(2);
    expect(progresses[1].pct).toBeCloseTo(100, 1);

    expect(result.outputPath).toBe('/out/video.mp4');
    expect(result.durationSec).toBe(60);
    expect(result.elapsedMs).toBe(30_000);
    // 1440 frames in 30s -> 48 avg fps
    expect(result.avgFps).toBeCloseTo(48, 1);
    expect(result.outputBytes).toBe(12_345);
  });

  it('calls probeDuration with the input video path', async () => {
    const child = new MockChild();
    const deps = makeDeps(child);

    const proc = new FFmpegProcessor(makeJob(), {}, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);
    child.close(0);
    await runPromise;

    expect(deps.probeDuration).toHaveBeenCalledWith('/in/video.mkv');
    expect(deps.spawn).toHaveBeenCalledWith('/bin/ffmpeg', expect.any(Array));
  });

  it('categorises stderr log lines', async () => {
    const child = new MockChild();
    const deps = makeDeps(child);
    const logs: LogLine[] = [];

    const proc = new FFmpegProcessor(makeJob(), { onLog: l => logs.push(l) }, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);

    child.pushStderr('Stream #0:0: Video: h264 1920x1080\n');
    child.pushStderr('Error: something went wrong\n');
    await new Promise(resolve => setImmediate(resolve));

    child.close(0);
    await runPromise;

    const stderrLogs = logs.filter(l => l.text.includes('Stream') || l.text.includes('Error'));
    const metadata = stderrLogs.find(l => l.text.includes('Stream'));
    const errorLog = stderrLogs.find(l => l.text.includes('Error'));
    expect(metadata?.level).toBe('trace');
    expect(errorLog?.level).toBe('error');
  });
});

describe('FFmpegProcessor.cancel()', () => {
  it('kills with SIGTERM, cleans up partial output, and rejects with CANCELLED', async () => {
    const child = new MockChild();
    const deps = makeDeps(child);

    const proc = new FFmpegProcessor(makeJob(), {}, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);

    proc.cancel();
    expect(child.killCalls).toEqual(['SIGTERM']);

    // ffmpeg closes with null (SIGTERM on POSIX) or non-zero on Windows.
    child.close(null);

    await expect(runPromise).rejects.toMatchObject({
      message: 'Encode cancelled',
      code: 'CANCELLED',
    });

    expect(deps.unlink).toHaveBeenCalledWith('/out/video.mp4');
  });

  it('is a no-op when called before run() has spawned a child', () => {
    const child = new MockChild();
    const deps = makeDeps(child);
    const proc = new FFmpegProcessor(makeJob(), {}, deps);
    expect(() => proc.cancel()).not.toThrow();
    expect(child.killCalls).toEqual([]);
  });

  it('swallows ENOENT from unlink (cancel before any output was written)', async () => {
    const child = new MockChild();
    const enoent = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const deps = makeDeps(child, {
      unlink: vi.fn(async () => {
        throw enoent;
      }),
    });

    const proc = new FFmpegProcessor(makeJob(), {}, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);
    proc.cancel();
    child.close(null);

    await expect(runPromise).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('FFmpegProcessor — audio fallback', () => {
  it('keeps audio=copy when source codec is lossy (e.g. aac in mp4)', async () => {
    const child = new MockChild();
    const deps = makeDeps(child, { probeAudioCodec: vi.fn(async () => 'aac') });

    const proc = new FFmpegProcessor(makeJob(), {}, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);
    child.close(0);
    await runPromise;

    const args = deps.spawn.mock.calls[0]![1];
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('copy');
  });

  it('overrides to AAC 192k when source is TrueHD + container is mp4', async () => {
    const child = new MockChild();
    const deps = makeDeps(child, { probeAudioCodec: vi.fn(async () => 'truehd') });
    const logs: LogLine[] = [];

    const proc = new FFmpegProcessor(makeJob(), { onLog: l => logs.push(l) }, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);
    child.close(0);
    await runPromise;

    const args = deps.spawn.mock.calls[0]![1];
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('aac');
    expect(args).toContain('-b:a');
    expect(args).toContain('192k');

    const fallbackLog = logs.find(l => l.text.includes('Audio fallback'));
    expect(fallbackLog).toBeTruthy();
  });

  it('uses explicit job.sourceAudioCodec over probeAudioCodec when present', async () => {
    const child = new MockChild();
    const probeAudio = vi.fn(async () => 'never-called');
    const deps = makeDeps(child, { probeAudioCodec: probeAudio });

    const proc = new FFmpegProcessor(makeJob({ sourceAudioCodec: 'flac' }), {}, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);
    child.close(0);
    await runPromise;

    expect(probeAudio).not.toHaveBeenCalled();
    const args = deps.spawn.mock.calls[0]![1];
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('aac');
  });
});

describe('FFmpegProcessor — error paths', () => {
  it('rejects with the ffmpeg exit error on non-zero exit code', async () => {
    const child = new MockChild();
    const deps = makeDeps(child);
    let capturedError: Error | null = null;

    const proc = new FFmpegProcessor(makeJob(), { onError: e => (capturedError = e) }, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);
    child.close(42);

    await expect(runPromise).rejects.toThrow(/exited with code 42/);
    expect(capturedError).toBeTruthy();
  });

  it('propagates spawn errors via onError + reject', async () => {
    const child = new MockChild();
    const deps = makeDeps(child);
    let capturedError: Error | null = null;

    const proc = new FFmpegProcessor(makeJob(), { onError: e => (capturedError = e) }, deps);
    const runPromise = proc.run();
    await waitForSpawn(deps);

    const spawnErr = new Error('ENOENT ffmpeg not found');
    child.emit('error', spawnErr);

    await expect(runPromise).rejects.toThrow('ENOENT ffmpeg not found');
    expect(capturedError).toBe(spawnErr);
  });
});
