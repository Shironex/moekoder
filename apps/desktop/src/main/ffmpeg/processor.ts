/**
 * FFmpegProcessor — manages a single ffmpeg encode child process.
 *
 * Responsibilities:
 *   - Spawn ffmpeg with args built by {@link buildEncodeArgs}.
 *   - Parse structured progress from stdout (`-progress pipe:1`) and log
 *     lines from stderr (noise-filtered, level-categorised).
 *   - Forward progress / log / complete / error events to caller callbacks.
 *   - Support cancellation via SIGTERM + clean up the partial output.
 *   - Apply the lossless-in-MP4 audio-fallback decision before spawning.
 *
 * Does NOT manage the job queue — that lives in `encode/orchestrator.ts`.
 */
import type { ChildProcess } from 'node:child_process';
import type { EncodeJob } from './args';

export interface EncodeProgress {
  /** 0..100 based on `outTimeSec / durationSec`. */
  pct: number;
  fps: number;
  bitrateKbps: number;
  /** Realtime multiplier reported by ffmpeg (1.0 = realtime). */
  speed: number;
  outTimeSec: number;
  etaSec: number;
}

export interface LogLine {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'trace';
  text: string;
}

export interface EncodeResult {
  outputPath: string;
  durationSec: number;
  avgFps: number;
  outputBytes: number;
  elapsedMs: number;
}

export interface ProcessorCallbacks {
  onProgress?: (progress: EncodeProgress) => void;
  onLog?: (line: LogLine) => void;
  onComplete?: (result: EncodeResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Dependency-injection seam for tests. Production callers get the real
 * implementations via the default export constructor; tests pass stubs
 * for `spawn`, `unlink`, `statSize`, `probeDuration`, and `now`.
 */
export interface ProcessorDeps {
  spawn: (cmd: string, args: string[]) => ChildProcess;
  /** Resolve the ffmpeg binary path at spawn time. */
  getFfmpegPath: () => string;
  /** Probe the input for duration (seconds) — needed for pct calculation. */
  probeDuration: (videoPath: string) => Promise<number>;
  /** Detect the source audio codec — used to apply MP4 audio fallback. */
  probeAudioCodec?: (videoPath: string) => Promise<string | undefined>;
  /** `fs.unlink` with ENOENT swallowed. */
  unlink: (path: string) => Promise<void>;
  /** `fs.stat(path).size` — read after a successful encode. */
  statSize: (path: string) => Promise<number>;
  /** `Date.now` seam so elapsed-ms is deterministic in tests. */
  now: () => number;
}

export class FFmpegProcessor {
  private child: ChildProcess | null = null;
  private wasCancelled = false;
  private durationSec = 0;
  private startedAt = 0;
  private latestProgress: EncodeProgress = {
    pct: 0,
    fps: 0,
    bitrateKbps: 0,
    speed: 0,
    outTimeSec: 0,
    etaSec: 0,
  };
  private totalFrames = 0;
  private latestSizeBytes = 0;

  constructor(
    private readonly job: EncodeJob,
    private readonly callbacks: ProcessorCallbacks,
    private readonly deps: ProcessorDeps
  ) {}

  /** Implemented in follow-up commits. */
  async run(): Promise<EncodeResult> {
    // Keep fields referenced so TS noUnusedLocals doesn't complain until
    // the real implementation lands in the next commit.
    void this.job;
    void this.callbacks;
    void this.deps;
    void this.child;
    void this.wasCancelled;
    void this.durationSec;
    void this.startedAt;
    void this.latestProgress;
    void this.totalFrames;
    void this.latestSizeBytes;
    throw new Error('FFmpegProcessor.run() not yet implemented');
  }

  /** Implemented in follow-up commits. */
  cancel(): void {
    throw new Error('FFmpegProcessor.cancel() not yet implemented');
  }
}
