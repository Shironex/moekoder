import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PreflightResult } from '../ffmpeg/disk-space';
import type { EncodeProgress, EncodeResult, LogLine } from '../ffmpeg/processor';
import {
  cancelEncode,
  getActiveJobIds,
  getConcurrencyCap,
  setConcurrencyCap,
  startEncode,
  type OrchestratorDeps,
} from './orchestrator';
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
    probeAttachments: vi.fn(async () => []),
    extractFonts: vi.fn(async () => null),
    cleanupFontsDir: vi.fn(async () => {}),
    getUseEmbeddedFonts: vi.fn(() => true),
    readSubtitleFile: vi.fn(async () => ''),
    checkPreflight: vi.fn(async () => preflight),
    ensureDir: vi.fn(async () => {}),
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
  // Restore the default cap so concurrency-changing tests don't leak state.
  setConcurrencyCap(1);
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

describe('concurrency cap', () => {
  it('defaults to 1', () => {
    expect(getConcurrencyCap()).toBe(1);
  });

  it('allows N concurrent encodes when the cap is raised to N', async () => {
    setConcurrencyCap(2);
    const deps = makeDeps();
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/a.mkv', subtitlePath: '/in/a.ass', outputPath: '/out/a.mp4' },
      events,
      deps
    );
    await startEncode(
      { videoPath: '/in/b.mkv', subtitlePath: '/in/b.ass', outputPath: '/out/b.mp4' },
      events,
      deps
    );
    expect(getActiveJobIds()).toHaveLength(2);

    // A third start at cap=2 must reject.
    await expect(
      startEncode(
        { videoPath: '/in/c.mkv', subtitlePath: '/in/c.ass', outputPath: '/out/c.mp4' },
        events,
        deps
      )
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });

    // Drain.
    processors[0]!.__finish({
      outputPath: '/out/a.mp4',
      durationSec: 60,
      avgFps: 48,
      outputBytes: 1,
      elapsedMs: 1,
    });
    processors[1]!.__finish({
      outputPath: '/out/b.mp4',
      durationSec: 60,
      avgFps: 48,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });

  it('rejects non-positive integer caps', () => {
    expect(() => setConcurrencyCap(0)).toThrow();
    expect(() => setConcurrencyCap(-1)).toThrow();
    expect(() => setConcurrencyCap(1.5)).toThrow();
  });
});

// -----------------------------------------------------------------------------
// v0.5.0 — MKV embedded font extraction.
// -----------------------------------------------------------------------------

describe('startEncode — font extraction (v0.5.0)', () => {
  const FONTS_DIR = '/tmp/mkfont-test';

  it('does not invoke the extractor when useEmbeddedFonts is off', async () => {
    const extractFonts = vi.fn(async () => ({ dir: FONTS_DIR, fontFiles: ['a.ttf'] }));
    const probeAttachments = vi.fn(async () => [{ index: 1, filename: 'a.ttf' }]);
    const deps = makeDeps({
      getUseEmbeddedFonts: vi.fn(() => false),
      extractFonts,
      probeAttachments,
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    expect(probeAttachments).not.toHaveBeenCalled();
    expect(extractFonts).not.toHaveBeenCalled();

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 1,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });

  it('skips extraction when the input has no attachments', async () => {
    const extractFonts = vi.fn(async () => null);
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => []),
      extractFonts,
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    expect(extractFonts).not.toHaveBeenCalled();
    expect(deps.createProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ fontsDir: undefined }),
      expect.any(Object)
    );

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 1,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });

  it('extracts and passes fontsDir to the processor when attachments exist + toggle on', async () => {
    const attachments = [{ index: 1, filename: 'Bauhaus.ttf' }];
    const extractFonts = vi.fn(async () => ({ dir: FONTS_DIR, fontFiles: ['Bauhaus.ttf'] }));
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => attachments),
      extractFonts,
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    expect(extractFonts).toHaveBeenCalledWith(
      expect.objectContaining({
        videoPath: '/in/v.mkv',
        attachments,
        jobId: 'job-1',
      })
    );
    expect(deps.createProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ fontsDir: FONTS_DIR }),
      expect.any(Object)
    );

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 1,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });

  it('cleans up the fonts dir on successful completion', async () => {
    const cleanupFontsDir = vi.fn(async () => {});
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => [{ index: 1, filename: 'a.ttf' }]),
      extractFonts: vi.fn(async () => ({ dir: FONTS_DIR, fontFiles: ['a.ttf'] })),
      cleanupFontsDir,
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 1,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();

    expect(cleanupFontsDir).toHaveBeenCalledWith(FONTS_DIR);
  });

  it('cleans up the fonts dir on cancellation (CANCELLED error path)', async () => {
    const cleanupFontsDir = vi.fn(async () => {});
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => [{ index: 1, filename: 'a.ttf' }]),
      extractFonts: vi.fn(async () => ({ dir: FONTS_DIR, fontFiles: ['a.ttf'] })),
      cleanupFontsDir,
    });
    const events = makeEvents();

    const { jobId } = await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    cancelEncode(jobId);
    processors[0]!.__fail(Object.assign(new Error('Encode cancelled'), { code: 'CANCELLED' }));
    await drainActive();

    expect(cleanupFontsDir).toHaveBeenCalledWith(FONTS_DIR);
  });

  it('cleans up the fonts dir when ffmpeg errors mid-encode', async () => {
    const cleanupFontsDir = vi.fn(async () => {});
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => [{ index: 1, filename: 'a.ttf' }]),
      extractFonts: vi.fn(async () => ({ dir: FONTS_DIR, fontFiles: ['a.ttf'] })),
      cleanupFontsDir,
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    processors[0]!.__fail(new Error('ffmpeg exited with code 42'));
    await drainActive();

    expect(cleanupFontsDir).toHaveBeenCalledWith(FONTS_DIR);
  });

  it('emits a warn per `\\fn` reference that is missing from the extracted set', async () => {
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => [{ index: 1, filename: 'Bauhaus 93.ttf' }]),
      extractFonts: vi.fn(async () => ({ dir: FONTS_DIR, fontFiles: ['Bauhaus 93.ttf'] })),
      readSubtitleFile: vi.fn(
        async () => '{\\fn(Bauhaus 93)}line one\n{\\fn(Comic Sans MS)}line two\n'
      ),
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    const warnLogs = events.onLog.mock.calls.filter(
      ([, line]) => (line as { level: string }).level === 'warn'
    );
    // "Bauhaus 93" matches extracted "Bauhaus 93.ttf" — only Comic Sans MS warns.
    expect(warnLogs).toHaveLength(1);
    expect(warnLogs[0]![1]).toMatchObject({
      level: 'warn',
      text: expect.stringContaining('Comic Sans MS'),
    });

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 1,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });

  it('continues silently when the subtitle file cannot be read', async () => {
    // Diagnostic is best-effort — a missing or locked ASS must not break
    // an encode whose fontsdir already extracted successfully.
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => [{ index: 1, filename: 'a.ttf' }]),
      extractFonts: vi.fn(async () => ({ dir: FONTS_DIR, fontFiles: ['a.ttf'] })),
      readSubtitleFile: vi.fn(async () => {
        throw new Error('ENOENT');
      }),
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    expect(deps.createProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ fontsDir: FONTS_DIR }),
      expect.any(Object)
    );

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 1,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
  });

  it('falls back to a no-fontsdir encode and warns when extraction throws', async () => {
    const deps = makeDeps({
      probeAttachments: vi.fn(async () => [{ index: 1, filename: 'a.ttf' }]),
      extractFonts: vi.fn(async () => {
        throw new Error('ffmpeg missing');
      }),
    });
    const events = makeEvents();

    await startEncode(
      { videoPath: '/in/v.mkv', subtitlePath: '/in/s.ass', outputPath: '/out/v.mp4' },
      events,
      deps
    );

    expect(deps.createProcessor).toHaveBeenCalledWith(
      expect.objectContaining({ fontsDir: undefined }),
      expect.any(Object)
    );
    expect(events.onLog).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        level: 'warn',
        text: expect.stringContaining('Font extraction failed'),
      })
    );

    processors[0]!.__finish({
      outputPath: '/out/v.mp4',
      durationSec: 60,
      avgFps: 1,
      outputBytes: 1,
      elapsedMs: 1,
    });
    await drainActive();
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
