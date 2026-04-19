import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PreflightResult } from '../ffmpeg/disk-space';
import type { EncodeProgress, EncodeResult, LogLine } from '../ffmpeg/processor';
import { cancelEncode, getActiveJobIds, startEncode, type OrchestratorDeps } from './orchestrator';
import { isIpcError } from '../ipc/errors';

interface StubProcessor {
  run: () => Promise<EncodeResult>;
  cancel: () => void;
  /** Test helpers to drive the processor lifecycle. */
  __triggerProgress: (p: EncodeProgress) => void;
  __triggerLog: (l: LogLine) => void;
  __finish: (r: EncodeResult) => void;
  __fail: (e: Error) => void;
  __cancelled: boolean;
}

const makeOkPreflight = (): PreflightResult => ({
  freeBytes: 10_000_000_000,
  estimatedBytes: 100_000_000,
  safetyMarginBytes: 209_715_200,
  ok: true,
  shortfallBytes: 0,
});

const makeFailPreflight = (): PreflightResult => ({
  freeBytes: 50_000_000,
  estimatedBytes: 100_000_000,
  safetyMarginBytes: 209_715_200,
  ok: false,
  shortfallBytes: 259_715_200,
});

let processors: StubProcessor[];

const makeDeps = (
  overrides: Partial<OrchestratorDeps> = {},
  preflight: PreflightResult = makeOkPreflight()
): OrchestratorDeps => {
  processors = [];
  let jobCounter = 0;
  return {
    createProcessor: vi.fn((_job, callbacks) => {
      let resolveRun!: (r: EncodeResult) => void;
      let rejectRun!: (e: Error) => void;
      const runPromise = new Promise<EncodeResult>((resolve, reject) => {
        resolveRun = resolve;
        rejectRun = reject;
      });
      const stub: StubProcessor = {
        run: () => runPromise,
        cancel: vi.fn(() => {
          stub.__cancelled = true;
        }),
        __cancelled: false,
        __triggerProgress: p => callbacks.onProgress?.(p),
        __triggerLog: l => callbacks.onLog?.(l),
        __finish: r => {
          callbacks.onComplete?.(r);
          resolveRun(r);
        },
        __fail: e => {
          callbacks.onError?.(e);
          rejectRun(e);
        },
      };
      processors.push(stub);
      return stub;
    }),
    probeDuration: vi.fn(async () => 60),
    checkPreflight: vi.fn(async () => preflight),
    newJobId: vi.fn(() => `job-${++jobCounter}`),
    ...overrides,
  };
};

const makeEvents = () => ({
  onProgress: vi.fn(),
  onLog: vi.fn(),
  onComplete: vi.fn(),
  onError: vi.fn(),
});

const drainActive = async (): Promise<void> => {
  // Rejected promises caught inside the orchestrator still leave microtasks
  // pending — drain them so the registry cleanup settles before assertions.
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
};

beforeEach(() => {
  // Reset module-level registry by finishing any leftover jobs from prior tests.
});

afterEach(async () => {
  // Defensive cleanup — cancel anything still active to keep the Map clean
  // between tests. We tolerate errors in the no-op case.
  for (const id of getActiveJobIds()) {
    cancelEncode(id);
    const proc = processors.find(p => p.__cancelled);
    proc?.__fail(Object.assign(new Error('test cleanup'), { code: 'CANCELLED' }));
  }
  await drainActive();
});

describe('startEncode — happy path', () => {
  it('probes, preflight-checks, creates processor, returns jobId + preflight', async () => {
    const deps = makeDeps();
    const events = makeEvents();

    const result = await startEncode(
      {
        videoPath: '/in/video.mkv',
        subtitlePath: '/in/sub.ass',
        outputPath: '/out/video.mp4',
      },
      events,
      deps
    );

    expect(result.jobId).toBe('job-1');
    expect(result.preflight.ok).toBe(true);
    expect(deps.probeDuration).toHaveBeenCalledWith('/in/video.mkv');
    expect(deps.checkPreflight).toHaveBeenCalledWith('/out', 60, expect.any(Number));
    expect(processors).toHaveLength(1);
    expect(getActiveJobIds()).toEqual(['job-1']);

    // End the job so the registry cleans up.
    processors[0]!.__finish({
      outputPath: '/out/video.mp4',
      durationSec: 60,
      avgFps: 48,
      outputBytes: 1024,
      elapsedMs: 30_000,
    });
    await drainActive();
    expect(events.onComplete).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ avgFps: 48 })
    );
    expect(getActiveJobIds()).toEqual([]);
  });

  it('forwards progress + log events with the jobId prefix', async () => {
    const deps = makeDeps();
    const events = makeEvents();

    const { jobId } = await startEncode(
      {
        videoPath: '/in/v.mkv',
        subtitlePath: '/in/s.ass',
        outputPath: '/out/v.mp4',
      },
      events,
      deps
    );

    const p: EncodeProgress = {
      pct: 50,
      fps: 60,
      bitrateKbps: 2000,
      speed: 1.5,
      outTimeSec: 30,
      etaSec: 20,
    };
    processors[0]!.__triggerProgress(p);
    processors[0]!.__triggerLog({ ts: 1, level: 'info', text: 'hi' });

    expect(events.onProgress).toHaveBeenCalledWith(jobId, p);
    expect(events.onLog).toHaveBeenCalledWith(jobId, expect.objectContaining({ text: 'hi' }));

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 60,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });
});

describe('startEncode — preflight failure', () => {
  it('throws IpcError("UNAVAILABLE") with shortfall in details when disk is short', async () => {
    const deps = makeDeps({}, makeFailPreflight());
    const events = makeEvents();

    try {
      await startEncode(
        {
          videoPath: '/in/v.mkv',
          subtitlePath: '/in/s.ass',
          outputPath: '/out/v.mp4',
        },
        events,
        deps
      );
      expect.fail('startEncode should have thrown');
    } catch (err) {
      expect(isIpcError(err)).toBe(true);
      const ipcErr = err as { code: string; details?: { shortfallBytes: number } };
      expect(ipcErr.code).toBe('UNAVAILABLE');
      expect(ipcErr.details?.shortfallBytes).toBeGreaterThan(0);
    }

    expect(processors).toHaveLength(0);
    expect(getActiveJobIds()).toEqual([]);
  });
});

describe('startEncode — single-job constraint', () => {
  it('rejects a second start while the first is still running', async () => {
    const deps = makeDeps();
    const events = makeEvents();

    await startEncode(
      {
        videoPath: '/in/a.mkv',
        subtitlePath: '/in/a.ass',
        outputPath: '/out/a.mp4',
      },
      events,
      deps
    );

    await expect(
      startEncode(
        {
          videoPath: '/in/b.mkv',
          subtitlePath: '/in/b.ass',
          outputPath: '/out/b.mp4',
        },
        events,
        deps
      )
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Another encode is already running',
    });

    // Clean up.
    processors[0]!.__finish({
      outputPath: '/out/a.mp4',
      durationSec: 60,
      avgFps: 48,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });

  it('allows a second start after the first completes', async () => {
    const deps = makeDeps();
    const events = makeEvents();

    await startEncode(
      {
        videoPath: '/in/a.mkv',
        subtitlePath: '/in/a.ass',
        outputPath: '/out/a.mp4',
      },
      events,
      deps
    );
    processors[0]!.__finish({
      outputPath: '/out/a.mp4',
      durationSec: 60,
      avgFps: 48,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();

    // Second start should succeed and get a new jobId.
    const second = await startEncode(
      {
        videoPath: '/in/b.mkv',
        subtitlePath: '/in/b.ass',
        outputPath: '/out/b.mp4',
      },
      events,
      deps
    );
    expect(second.jobId).toBe('job-2');

    processors[1]!.__finish({
      outputPath: '/out/b.mp4',
      durationSec: 60,
      avgFps: 48,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });
});

describe('cancelEncode', () => {
  it('returns true and cancels an active processor', async () => {
    const deps = makeDeps();
    const events = makeEvents();

    const { jobId } = await startEncode(
      {
        videoPath: '/in/v.mkv',
        subtitlePath: '/in/s.ass',
        outputPath: '/out/v.mp4',
      },
      events,
      deps
    );

    const res = cancelEncode(jobId);
    expect(res).toBe(true);
    expect(processors[0]!.__cancelled).toBe(true);

    // The processor completes the cancellation by failing with CANCELLED.
    processors[0]!.__fail(Object.assign(new Error('Encode cancelled'), { code: 'CANCELLED' }));
    await drainActive();

    expect(events.onError).toHaveBeenCalledWith(
      jobId,
      expect.objectContaining({ code: 'CANCELLED' })
    );
    expect(getActiveJobIds()).toEqual([]);
  });

  it('returns false for an unknown jobId', () => {
    expect(cancelEncode('does-not-exist')).toBe(false);
  });
});

describe('registry cleanup on error', () => {
  it('removes the job from the registry when the processor errors', async () => {
    const deps = makeDeps();
    const events = makeEvents();

    await startEncode(
      {
        videoPath: '/in/v.mkv',
        subtitlePath: '/in/s.ass',
        outputPath: '/out/v.mp4',
      },
      events,
      deps
    );

    processors[0]!.__fail(new Error('ffmpeg exited with code 42'));
    await drainActive();

    expect(getActiveJobIds()).toEqual([]);
    expect(events.onError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: 'INTERNAL' })
    );
  });
});
