/**
 * Benchmark mode — run a small set of candidate encoding profiles on a
 * 10-second sample of the source and surface size / time / PSNR per
 * candidate so the user can pick a profile empirically.
 *
 * Each candidate runs as a single sequential job through the existing
 * `startEncode` orchestrator, so concurrency caps + preflight checks +
 * progress events all behave the same way as a real encode. Output goes
 * under `<userData>/benchmark/<runId>/<candidateId>.<ext>` so leftover
 * files from a hung run can be inspected; successful runs clean up.
 *
 * The orchestrator's `EncodeStartInput.clipWindow` propagates into
 * `EncodeJob.clipWindow`, which the arg builder reflects into
 * `-ss <start> -t <duration>` ahead of `-i`. No new ffmpeg work — the
 * sample window rides the same processor + parser surface.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { app } from 'electron';
import { startEncode, type EncodeStartInput } from './orchestrator';
import { computePsnr, type PsnrDeps } from '../ffmpeg/psnr';
import type { EncodeProgress, EncodeResult, LogLine } from '../ffmpeg/processor';
import type { PreflightResult } from '../ffmpeg/disk-space';

/** Standard sample length for benchmark runs. 10s is a good signal/cost balance. */
export const BENCHMARK_CLIP_SEC = 10;
/** Max number of candidates the renderer can request per run. */
export const BENCHMARK_MAX_CANDIDATES = 4;

export interface BenchmarkCandidate {
  /** Stable id picked by the renderer; used as the temp filename + result key. */
  id: string;
  /** Display label surfaced in the result table. */
  label: string;
  /** Encoding profile partial — same shape `encode:start` accepts. */
  settings: Record<string, unknown>;
  /** Output container (mp4 / mkv) — controls the temp filename extension. */
  container: 'mp4' | 'mkv';
}

export interface BenchmarkInput {
  videoPath: string;
  subtitlePath: string;
  /** Where in the source to start the sample. Defaults to 0 (beginning). */
  startSec?: number;
  /** Sample length. Defaults to {@link BENCHMARK_CLIP_SEC}. */
  durationSec?: number;
  candidates: BenchmarkCandidate[];
}

export interface BenchmarkCandidateResult {
  id: string;
  label: string;
  /** Output file size in bytes. `null` when the encode failed. */
  sizeBytes: number | null;
  /** Wall-clock encode time in milliseconds. `null` when the encode failed. */
  elapsedMs: number | null;
  /** Average PSNR (dB). `null` when not yet computed or computation failed. */
  psnr: number | null;
  /** Error message when the candidate failed; `null` on success. */
  error: string | null;
}

export interface BenchmarkProgress {
  /** 0-based index of the candidate currently running. */
  candidateIndex: number;
  /** Phase within the candidate's lifecycle. */
  phase: 'encoding' | 'measuring-psnr' | 'done' | 'error';
  /** ffmpeg progress payload during the encoding phase. */
  encodeProgress?: EncodeProgress;
}

export interface BenchmarkEvents {
  onProgress: (p: BenchmarkProgress) => void;
  onLog: (line: LogLine) => void;
}

/**
 * DI seam for tests + production. Production wires the default
 * orchestrator + PSNR helper; tests pass stubs.
 */
export interface BenchmarkDeps {
  /** Run an encode and resolve when it terminates. */
  runEncode: (
    input: EncodeStartInput,
    callbacks: {
      onProgress: (progress: EncodeProgress) => void;
      onLog: (line: LogLine) => void;
    }
  ) => Promise<{ result: EncodeResult; preflight: PreflightResult }>;
  /** PSNR computation deps (lets tests stub the spawn). */
  psnrDeps?: PsnrDeps;
  /** Resolve `<userData>/benchmark` (or its dev equivalent). */
  getBenchmarkRoot: () => string;
  /** UUID factory for the run-level directory name. */
  newRunId: () => string;
  /** `Date.now` seam. */
  now: () => number;
}

/**
 * Default `runEncode` shim — wraps `startEncode` so the benchmark waits
 * for the encode to complete (or fail) before scoring it.
 */
const defaultRunEncode: BenchmarkDeps['runEncode'] = (input, callbacks) =>
  new Promise((resolve, reject) => {
    let preflight: PreflightResult | undefined;
    void startEncode(input, {
      onProgress: (_jobId, progress) => callbacks.onProgress(progress),
      onLog: (_jobId, line) => callbacks.onLog(line),
      onComplete: (_jobId, result) => {
        if (preflight) resolve({ result, preflight });
        else reject(new Error('benchmark: encode completed without preflight payload'));
      },
      onError: (_jobId, error) => reject(new Error(error.message)),
    })
      .then(({ preflight: p }) => {
        preflight = p;
      })
      .catch(reject);
  });

export const defaultBenchmarkDeps = (): BenchmarkDeps => ({
  runEncode: defaultRunEncode,
  getBenchmarkRoot: () => path.join(app.getPath('userData'), 'benchmark'),
  newRunId: () => `run-${Date.now().toString(36)}`,
  now: () => Date.now(),
});

/**
 * Run all candidates sequentially. Resolves with one result per
 * candidate; failed candidates surface their error in `result.error`
 * rather than rejecting the whole run, so partial results survive a
 * single bad config. The temp run directory is removed on completion
 * (success OR all-failure); only mid-run hangs leave files behind.
 */
export const runBenchmark = async (
  input: BenchmarkInput,
  events: BenchmarkEvents,
  deps: BenchmarkDeps = defaultBenchmarkDeps()
): Promise<BenchmarkCandidateResult[]> => {
  if (input.candidates.length === 0) {
    return [];
  }
  if (input.candidates.length > BENCHMARK_MAX_CANDIDATES) {
    throw new Error(
      `benchmark: at most ${BENCHMARK_MAX_CANDIDATES} candidates per run (got ${input.candidates.length})`
    );
  }

  const startSec = input.startSec ?? 0;
  const durationSec = input.durationSec ?? BENCHMARK_CLIP_SEC;
  const runDir = path.join(deps.getBenchmarkRoot(), deps.newRunId());
  await fs.mkdir(runDir, { recursive: true });

  const results: BenchmarkCandidateResult[] = [];

  for (let i = 0; i < input.candidates.length; i++) {
    const c = input.candidates[i]!;
    const outputPath = path.join(runDir, `${c.id}.${c.container}`);
    const partial: BenchmarkCandidateResult = {
      id: c.id,
      label: c.label,
      sizeBytes: null,
      elapsedMs: null,
      psnr: null,
      error: null,
    };

    events.onProgress({ candidateIndex: i, phase: 'encoding' });

    const encodeStart = deps.now();
    try {
      const { result } = await deps.runEncode(
        {
          videoPath: input.videoPath,
          subtitlePath: input.subtitlePath,
          outputPath,
          settings: c.settings,
          clipWindow: { startSec, durationSec },
        },
        {
          onProgress: progress =>
            events.onProgress({ candidateIndex: i, phase: 'encoding', encodeProgress: progress }),
          onLog: line => events.onLog(line),
        }
      );
      partial.sizeBytes = result.outputBytes;
      partial.elapsedMs = deps.now() - encodeStart;
    } catch (err) {
      partial.error = err instanceof Error ? err.message : String(err);
      events.onProgress({ candidateIndex: i, phase: 'error' });
      results.push(partial);
      continue;
    }

    events.onProgress({ candidateIndex: i, phase: 'measuring-psnr' });
    try {
      partial.psnr = await computePsnr(input.videoPath, outputPath, durationSec, deps.psnrDeps);
    } catch (err) {
      // PSNR failure isn't fatal for the benchmark — surface it on the
      // log stream and leave `psnr` null so the user can still see the
      // size + time numbers.
      events.onLog({
        ts: deps.now(),
        level: 'warn',
        text: `PSNR computation failed for "${c.label}": ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    events.onProgress({ candidateIndex: i, phase: 'done' });
    results.push(partial);
  }

  // Best-effort cleanup. Leave the run dir alone on partial failure so
  // the user can inspect leftovers — only delete when every candidate
  // either succeeded or surfaced its error in the result table.
  try {
    await fs.rm(runDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }

  return results;
};
