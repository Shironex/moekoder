/**
 * Encode orchestrator — the single source of truth for active encode jobs.
 *
 * v0.3.0 lifts the v0.1 single-job lock to a configurable concurrency cap.
 * The default cap stays at 1 so the Single route preserves its one-encode-
 * at-a-time guarantee; the queue manager bumps the cap to
 * `queueConcurrency` while the queue is running and restores it afterward.
 * Jobs are tracked in a `Map<jobId, Processor>` so the queue layer can
 * dispatch parallel work without re-implementing process bookkeeping.
 *
 * Responsibilities:
 *   - Generate a stable `jobId` per encode.
 *   - Run the disk-space preflight + throw `IpcError('UNAVAILABLE', …)`
 *     when the target volume can't fit the estimate.
 *   - Construct an {@link FFmpegProcessor}, wire its callbacks to the
 *     `events` object, and track it in the active-jobs registry.
 *
 * Does NOT talk to IPC directly — that's the handler's job. The
 * orchestrator's `events` parameter is a plain object the handler
 * implements to forward to `webContents.send`.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { EncodeJob } from '../ffmpeg/args';
import { checkPreflight, type PreflightResult } from '../ffmpeg/disk-space';
import {
  cleanupFontsDir as defaultCleanupFontsDir,
  extractFonts as defaultExtractFonts,
  type FontExtractResult,
} from '../ffmpeg/font-extractor';
import {
  FFmpegProcessor,
  type EncodeProgress,
  type EncodeResult,
  type LogLine,
  type ProcessorDeps,
} from '../ffmpeg/processor';
import { probe, type ProbeAttachment } from '../ffmpeg/probe';
import {
  BALANCED_BITRATE_KBPS,
  defaultsFor,
  type EncodingSettings,
  type VideoCodec,
} from '../ffmpeg/settings';
import { getSetting } from '../store';
import { getFfmpegPath } from '../utils/bin-paths';
import { IpcError } from '../ipc/errors';
import { spawn } from 'node:child_process';

export interface EncodeStartInput {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  /**
   * Optional partial overrides merged on top of the per-codec Balanced
   * default selected via {@link defaultsFor}. The merge picks the codec
   * default from `settings.codec` BEFORE the spread so a partial like
   * `{ codec: 'hevc', cq: 24 }` does not inherit H.264-only fields.
   *
   * Typed as `Record<string, unknown>` because the IPC schema layer can
   * only validate the shape loosely; the orchestrator coerces fields it
   * recognises onto the typed default and discards the rest.
   */
  settings?: Record<string, unknown>;
  /**
   * Optional clip window — propagated to {@link EncodeJob.clipWindow} so
   * benchmark mode can encode a fixed-duration sample without writing a
   * second orchestrator. Not exposed at the IPC `encode:start` boundary;
   * benchmark mode calls `startEncode` directly through its own handler.
   */
  clipWindow?: { startSec: number; durationSec: number };
}

export interface EncodeStartResult {
  jobId: string;
  preflight: PreflightResult;
}

export interface EncodeEvents {
  onProgress: (jobId: string, p: EncodeProgress) => void;
  onLog: (jobId: string, line: LogLine) => void;
  onComplete: (jobId: string, r: EncodeResult) => void;
  onError: (jobId: string, e: { code: string; message: string }) => void;
}

/**
 * DI seam for tests. Production wiring constructs a default `OrchestratorDeps`
 * in {@link defaultOrchestratorDeps}. Tests pass stubs.
 */
export interface OrchestratorDeps {
  /** Factory that builds an FFmpegProcessor for a given job + callbacks. */
  createProcessor: (
    job: EncodeJob,
    callbacks: {
      onProgress?: (p: EncodeProgress) => void;
      onLog?: (l: LogLine) => void;
      onComplete?: (r: EncodeResult) => void;
      onError?: (e: Error) => void;
    }
  ) => { run: () => Promise<EncodeResult>; cancel: () => void };
  /** Probe duration for preflight. */
  probeDuration: (videoPath: string) => Promise<number>;
  /**
   * Probe attachments (v0.5.0) — feeds the font-extractor. Separated
   * from `probeDuration` so tests can stub each independently. Returns
   * an empty array when the input has no attachment streams.
   */
  probeAttachments: (videoPath: string) => Promise<ProbeAttachment[]>;
  /**
   * Extract MKV-embedded fonts into a per-job temp dir. Returns `null`
   * when the input has no font-shaped attachments (no fontsdir needed)
   * or when the user has toggled off `useEmbeddedFonts`. May throw on a
   * genuine extractor failure — the orchestrator catches that, emits a
   * warn, and proceeds with the v0.4 (no-fontsdir) filter chain so a
   * font-extraction hiccup never blocks an encode.
   */
  extractFonts: (input: {
    videoPath: string;
    attachments: ProbeAttachment[];
    jobId: string;
    onLog?: (line: LogLine) => void;
  }) => Promise<FontExtractResult | null>;
  /** Remove a per-job fonts temp dir. ENOENT-tolerant. */
  cleanupFontsDir: (dir: string) => Promise<void>;
  /** Setting reader — seamed so tests can flip `useEmbeddedFonts` per case. */
  getUseEmbeddedFonts: () => boolean;
  /** Preflight check (mocked in tests). */
  checkPreflight: (
    outputDir: string,
    durationSec: number,
    bitrateKbps: number
  ) => Promise<PreflightResult>;
  /**
   * Create the output directory (recursive) before the preflight runs.
   * Split out as a seam so tests can stub it without hitting the real fs —
   * the renderer can derive output paths that don't yet exist (e.g. the
   * onboarding `moekoder` save target maps to `<source>/moekoder/`).
   */
  ensureDir: (dir: string) => Promise<void>;
  /** UUID factory — swapped for a deterministic one in tests. */
  newJobId: () => string;
}

interface ActiveJob {
  cancel: () => void;
  /** Resolves when the processor run settles (complete or error — never rejects). */
  done: Promise<void>;
  /**
   * Per-job MKV-fonts temp dir (v0.5.0). Set when the font-extractor
   * produced a fontsdir for this job; both terminal callbacks
   * (onComplete + onError / cancel) clean it up. Undefined when the
   * input had no attachments, the user toggled extraction off, or the
   * extractor failed and we fell back to the v0.4 filter chain.
   */
  fontsDir?: string;
}

const activeJobs = new Map<string, ActiveJob>();

/**
 * Concurrency cap for parallel encodes. Defaults to 1 so the Single route
 * keeps its one-encode-at-a-time guarantee; the queue manager raises this
 * to `queueConcurrency` while it has a queue running and lowers it back to
 * 1 when the queue drains. Single-route handlers always call `startEncode`
 * with the cap at 1 so a stale concurrency change can't leak across.
 */
let concurrencyCap = 1;

/** Publicly-readable active job ids (mostly for tests + diagnostics). */
export const getActiveJobIds = (): string[] => [...activeJobs.keys()];

/** Read the current concurrency cap. Exposed for diagnostics + tests. */
export const getConcurrencyCap = (): number => concurrencyCap;

/**
 * Replace the cap. Pass an integer in `[1, 4]` — the queue manager validates
 * upstream via zod so this is a thin setter. Lowering the cap below the
 * current `activeJobs.size` does NOT cancel running encodes; it just rejects
 * new starts until enough jobs settle to fit under the new ceiling.
 */
export const setConcurrencyCap = (cap: number): void => {
  if (!Number.isInteger(cap) || cap < 1) {
    throw new IpcError('INVALID_INPUT', `concurrencyCap must be a positive integer, got ${cap}`);
  }
  concurrencyCap = cap;
};

/**
 * Starts an encode. Returns immediately after the preflight check + spawn;
 * callers consume progress / completion via the `events` callbacks.
 *
 * Rejects with `IpcError('UNAVAILABLE')` when the active-jobs map is already
 * at the configured concurrency cap. The Single-route UI keeps the cap at 1,
 * so this preserves the v0.1.0 "another encode is already running" surface
 * verbatim until the queue manager raises the cap.
 */
export const startEncode = async (
  input: EncodeStartInput,
  events: EncodeEvents,
  deps: OrchestratorDeps = defaultOrchestratorDeps()
): Promise<EncodeStartResult> => {
  if (activeJobs.size >= concurrencyCap) {
    throw new IpcError('UNAVAILABLE', 'Another encode is already running');
  }

  // Pick the per-codec default BEFORE spreading the partial — see the v0.4
  // research doc gotcha. `Partial<DiscriminatedUnion>` does not preserve
  // the discriminant linkage, so spreading an HEVC partial onto an H.264
  // default would silently produce a frankenstein blob.
  const codec = (input.settings?.codec as VideoCodec | undefined) ?? 'h264';
  const settings = {
    ...defaultsFor(codec),
    ...(input.settings ?? {}),
  } as EncodingSettings;

  const durationSec = await deps.probeDuration(input.videoPath);
  const outputDir = path.dirname(input.outputPath);
  // The renderer can derive output dirs the user never created — e.g. the
  // onboarding `moekoder` save target maps to `<source>/moekoder/`, which
  // won't exist until the first encode. Create it recursively here so the
  // preflight `fs.statfs` call + ffmpeg itself both find a real directory.
  // Idempotent: existing directories are left alone.
  await deps.ensureDir(outputDir);
  const preflight = await deps.checkPreflight(outputDir, durationSec, BALANCED_BITRATE_KBPS);

  if (!preflight.ok) {
    throw new IpcError(
      'UNAVAILABLE',
      `Insufficient disk space at ${outputDir}: needs ${preflight.shortfallBytes} more bytes`,
      preflight
    );
  }

  const jobId = deps.newJobId();

  // v0.5.0 — MKV embedded font extraction. Runs after preflight (which
  // is the disk-space gate) so we don't dump fonts only to fail at the
  // start line. Guarded by `useEmbeddedFonts`; an extractor failure
  // logs a warning and degrades to v0.4 behaviour rather than killing
  // the encode.
  let fontsDir: string | undefined;
  if (deps.getUseEmbeddedFonts()) {
    try {
      const attachments = await deps.probeAttachments(input.videoPath);
      if (attachments.length > 0) {
        const extracted = await deps.extractFonts({
          videoPath: input.videoPath,
          attachments,
          jobId,
          onLog: l => events.onLog(jobId, l),
        });
        if (extracted) fontsDir = extracted.dir;
      }
    } catch (err) {
      // Soft failure: log and continue without a fontsdir. The encode
      // will still produce output; typeset cues may fall back to the
      // system default fonts (which is exactly v0.4 behaviour).
      events.onLog(jobId, {
        ts: Date.now(),
        level: 'warn',
        text: `Font extraction failed: ${err instanceof Error ? err.message : String(err)}. Continuing without embedded fonts.`,
      });
    }
  }

  const job: EncodeJob = {
    videoPath: input.videoPath,
    subtitlePath: input.subtitlePath,
    outputPath: input.outputPath,
    settings,
    clipWindow: input.clipWindow,
    fontsDir,
  };

  // Cleanup is idempotent + ENOENT-tolerant. We invoke it from BOTH
  // terminal callbacks (onComplete + onError/cancel) so a user-initiated
  // cancel does not leave the temp dir behind. The promise is detached
  // — we don't block the renderer-facing event on disk cleanup.
  const cleanupFontsIfAny = (): void => {
    if (!fontsDir) return;
    void deps.cleanupFontsDir(fontsDir).catch(() => {
      // Swallow — the extractor's own cleanup is best-effort and
      // ENOENT-tolerant. Re-emitting an error here would be noise.
    });
  };

  const processor = deps.createProcessor(job, {
    onProgress: p => events.onProgress(jobId, p),
    onLog: l => events.onLog(jobId, l),
    onComplete: r => {
      activeJobs.delete(jobId);
      cleanupFontsIfAny();
      events.onComplete(jobId, r);
    },
    onError: e => {
      activeJobs.delete(jobId);
      cleanupFontsIfAny();
      // Propagate a CANCELLED error with that code instead of the generic
      // INTERNAL bucket so renderer code can distinguish user-initiated stops.
      const code = (e as Error & { code?: string }).code === 'CANCELLED' ? 'CANCELLED' : 'INTERNAL';
      events.onError(jobId, { code, message: e.message });
    },
  });

  // Fire and forget — the processor surfaces results via its callbacks.
  // Retain the settlement promise so graceful shutdown can await it when
  // the app is quitting mid-encode.
  const done = processor.run().then(
    () => undefined,
    () => undefined
  );
  activeJobs.set(jobId, { cancel: () => processor.cancel(), done, fontsDir });

  return { jobId, preflight };
};

/** Signals an in-progress encode to stop. Returns true if the jobId was active. */
export const cancelEncode = (jobId: string): boolean => {
  const entry = activeJobs.get(jobId);
  if (!entry) return false;
  entry.cancel();
  return true;
};

/**
 * Cancel every active encode and wait for each processor to settle. Used by
 * the `before-quit` shutdown path so the app doesn't exit while ffmpeg is
 * still writing frames — leaving a truncated output behind. Safe to call
 * when no jobs are running (resolves immediately).
 */
export const cancelAllEncodes = async (): Promise<void> => {
  const jobs = [...activeJobs.values()];
  for (const job of jobs) job.cancel();
  await Promise.allSettled(jobs.map(j => j.done));
};

/** Default dependency wiring for production. */
export const defaultOrchestratorDeps = (): OrchestratorDeps => {
  const processorDeps: ProcessorDeps = {
    spawn: (cmd, args) => spawn(cmd, args, { windowsHide: true }),
    getFfmpegPath,
    probeDuration: async (videoPath: string) => (await probe(videoPath)).durationSec,
    probeAudioCodec: async (videoPath: string) => {
      const result = await probe(videoPath);
      return result.audioStreams[0]?.codec;
    },
    unlink: async p => {
      await fs.unlink(p).catch(err => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      });
    },
    statSize: async p => (await fs.stat(p)).size,
    now: () => Date.now(),
  };

  return {
    createProcessor: (job, callbacks) => new FFmpegProcessor(job, callbacks, processorDeps),
    probeDuration: async (videoPath: string) => (await probe(videoPath)).durationSec,
    probeAttachments: async (videoPath: string) => (await probe(videoPath)).attachments,
    extractFonts: input =>
      defaultExtractFonts({
        videoPath: input.videoPath,
        attachments: input.attachments,
        jobId: input.jobId,
        ffmpegPath: getFfmpegPath(),
        onLog: input.onLog,
      }),
    cleanupFontsDir: dir => defaultCleanupFontsDir(dir),
    getUseEmbeddedFonts: () => getSetting('useEmbeddedFonts'),
    checkPreflight: (outputDir, durationSec, bitrateKbps) =>
      checkPreflight(outputDir, durationSec, bitrateKbps),
    ensureDir: async dir => {
      await fs.mkdir(dir, { recursive: true });
    },
    newJobId: () => randomUUID(),
  };
};
