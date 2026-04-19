/**
 * Encode orchestrator — the single source of truth for active encode jobs.
 *
 * v0.1.0 allows a single concurrent job (queueing lands in v0.3). The
 * orchestrator nevertheless stores jobs in a `Map<jobId, Processor>` so
 * the queue upgrade is a pure addition: the rest of the IPC surface +
 * event routing already speaks jobId.
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
  FFmpegProcessor,
  type EncodeProgress,
  type EncodeResult,
  type LogLine,
  type ProcessorDeps,
} from '../ffmpeg/processor';
import { probe } from '../ffmpeg/probe';
import { BALANCED_BITRATE_KBPS, BALANCED_PRESET, type EncodingSettings } from '../ffmpeg/settings';
import { getFfmpegPath } from '../utils/bin-paths';
import { IpcError } from '../ipc/errors';
import { spawn } from 'node:child_process';

export interface EncodeStartInput {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  /** Optional partial overrides merged on top of {@link BALANCED_PRESET}. */
  settings?: Partial<EncodingSettings>;
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
  /** Preflight check (mocked in tests). */
  checkPreflight: (
    outputDir: string,
    durationSec: number,
    bitrateKbps: number
  ) => Promise<PreflightResult>;
  /** UUID factory — swapped for a deterministic one in tests. */
  newJobId: () => string;
}

const activeJobs = new Map<string, { cancel: () => void }>();

/** Publicly-readable active job ids (mostly for tests + diagnostics). */
export const getActiveJobIds = (): string[] => [...activeJobs.keys()];

/**
 * Starts an encode. Returns immediately after the preflight check + spawn;
 * callers consume progress / completion via the `events` callbacks.
 */
export const startEncode = async (
  input: EncodeStartInput,
  events: EncodeEvents,
  deps: OrchestratorDeps = defaultOrchestratorDeps()
): Promise<EncodeStartResult> => {
  // v0.1 runs one encode at a time; queueing lands in v0.3.
  if (activeJobs.size > 0) {
    throw new IpcError('UNAVAILABLE', 'Another encode is already running');
  }

  const settings: EncodingSettings = { ...BALANCED_PRESET, ...(input.settings ?? {}) };

  const durationSec = await deps.probeDuration(input.videoPath);
  const outputDir = path.dirname(input.outputPath);
  const preflight = await deps.checkPreflight(outputDir, durationSec, BALANCED_BITRATE_KBPS);

  if (!preflight.ok) {
    throw new IpcError(
      'UNAVAILABLE',
      `Insufficient disk space at ${outputDir}: needs ${preflight.shortfallBytes} more bytes`,
      preflight
    );
  }

  const jobId = deps.newJobId();
  const job: EncodeJob = {
    videoPath: input.videoPath,
    subtitlePath: input.subtitlePath,
    outputPath: input.outputPath,
    settings,
  };

  const processor = deps.createProcessor(job, {
    onProgress: p => events.onProgress(jobId, p),
    onLog: l => events.onLog(jobId, l),
    onComplete: r => {
      activeJobs.delete(jobId);
      events.onComplete(jobId, r);
    },
    onError: e => {
      activeJobs.delete(jobId);
      // Propagate a CANCELLED error with that code instead of the generic
      // INTERNAL bucket so renderer code can distinguish user-initiated stops.
      const code = (e as Error & { code?: string }).code === 'CANCELLED' ? 'CANCELLED' : 'INTERNAL';
      events.onError(jobId, { code, message: e.message });
    },
  });

  activeJobs.set(jobId, { cancel: () => processor.cancel() });

  // Fire and forget — the processor surfaces results via its callbacks.
  void processor.run().catch(() => {
    // Already reported through `onError`; swallow here so the unhandled
    // rejection doesn't escape the orchestrator's process boundary.
  });

  return { jobId, preflight };
};

/** Signals an in-progress encode to stop. Returns true if the jobId was active. */
export const cancelEncode = (jobId: string): boolean => {
  const entry = activeJobs.get(jobId);
  if (!entry) return false;
  entry.cancel();
  return true;
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
    checkPreflight: (outputDir, durationSec, bitrateKbps) =>
      checkPreflight(outputDir, durationSec, bitrateKbps),
    newJobId: () => randomUUID(),
  };
};
