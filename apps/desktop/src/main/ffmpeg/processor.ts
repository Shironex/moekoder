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
import { buildEncodeArgs, type EncodeJob } from './args';
import { shouldTranscodeAudio } from './audio-fallback';
import {
  categorizeLog,
  filterLogLines,
  parseProgressPipe,
  type LogType,
  type PartialProgress,
} from './output-parser';

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

/**
 * Categorises an ffmpeg stderr line into the structured 4-level palette
 * we expose to the renderer. The full AG-Wypalarka 6-level palette is
 * flattened here — `metadata` + `debug` collapse to `trace`, `success`
 * collapses to `info`, `warning` to `warn`.
 */
const logLevelFromType = (type: LogType): LogLine['level'] => {
  switch (type) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warn';
    case 'debug':
    case 'metadata':
      return 'trace';
    default:
      return 'info';
  }
};

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
  private stdoutBuffer = '';
  private stderrBuffer = '';

  constructor(
    private readonly job: EncodeJob,
    private readonly callbacks: ProcessorCallbacks,
    private readonly deps: ProcessorDeps
  ) {}

  async run(): Promise<EncodeResult> {
    if (this.child) {
      throw new Error('FFmpegProcessor: run() called while a process is already active');
    }

    this.durationSec = await this.deps.probeDuration(this.job.videoPath);
    this.startedAt = this.deps.now();

    const effectiveJob = await this.applyAudioFallback(this.job);
    const args = buildEncodeArgs(effectiveJob);
    const ffmpegPath = this.deps.getFfmpegPath();
    this.emitLog('info', `ffmpeg ${args.join(' ')}`);

    const child = this.deps.spawn(ffmpegPath, args);
    this.child = child;

    return new Promise<EncodeResult>((resolve, reject) => {
      child.stdout?.on('data', (chunk: Buffer) => this.handleStdout(chunk));
      child.stderr?.on('data', (chunk: Buffer) => this.handleStderr(chunk));

      child.on('error', err => {
        this.child = null;
        this.callbacks.onError?.(err);
        reject(err);
      });

      child.on('close', code => {
        this.child = null;
        void this.onChildClose(code, resolve, reject);
      });
    });
  }

  /**
   * Signals the running ffmpeg process to stop. ffmpeg handles SIGTERM
   * cleanly — it flushes whatever frames are in flight and exits with
   * `null` (or `255` on Windows) which we map to a cancelled state in
   * {@link onChildClose}.
   *
   * Safe to call when no process is running (no-op) or after a cancel
   * has already been issued (idempotent).
   */
  cancel(): void {
    if (!this.child || this.wasCancelled) return;
    this.wasCancelled = true;
    try {
      this.child.kill('SIGTERM');
    } catch (err) {
      this.emitLog('warn', `Failed to SIGTERM ffmpeg child: ${String(err)}`);
    }
  }

  /**
   * Delete the partial output file after cancellation. Swallows ENOENT
   * so a cancel before ffmpeg has written any output is a silent no-op.
   */
  private async cleanupPartialOutput(): Promise<void> {
    try {
      await this.deps.unlink(this.job.outputPath);
      this.emitLog('info', `Deleted partial output: ${this.job.outputPath}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.emitLog('warn', `Failed to delete partial output: ${String(err)}`);
    }
  }

  private async onChildClose(
    code: number | null,
    resolve: (v: EncodeResult) => void,
    reject: (err: Error) => void
  ): Promise<void> {
    if (this.wasCancelled) {
      await this.cleanupPartialOutput();
      const err = new Error('Encode cancelled');
      (err as Error & { code?: string }).code = 'CANCELLED';
      this.callbacks.onError?.(err);
      reject(err);
      return;
    }

    if (code === 0) {
      const elapsedMs = this.deps.now() - this.startedAt;
      let outputBytes = this.latestSizeBytes;
      try {
        outputBytes = await this.deps.statSize(this.job.outputPath);
      } catch {
        // Fall back to the last in-progress size report.
      }
      const elapsedSec = elapsedMs / 1000;
      const avgFps = elapsedSec > 0 ? this.totalFrames / elapsedSec : 0;
      const result: EncodeResult = {
        outputPath: this.job.outputPath,
        durationSec: this.durationSec,
        avgFps,
        outputBytes,
        elapsedMs,
      };
      this.emitLog(
        'info',
        `Encode complete: ${this.totalFrames} frames in ${elapsedSec.toFixed(2)}s ` +
          `(avg ${avgFps.toFixed(1)} fps), ${outputBytes} bytes`
      );
      this.callbacks.onComplete?.(result);
      resolve(result);
      return;
    }

    const err = new Error(`ffmpeg exited with code ${code ?? 'null'}`);
    this.callbacks.onError?.(err);
    reject(err);
  }

  /**
   * Accumulate stdout into lines (structured progress key=value pairs).
   * Emits `onProgress` on each `progress=continue`/`progress=end`
   * sentinel with the latest accumulated snapshot.
   */
  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString('utf-8');

    let newlineIdx = this.stdoutBuffer.indexOf('\n');
    while (newlineIdx !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIdx);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1);
      this.applyProgressLine(line);
      newlineIdx = this.stdoutBuffer.indexOf('\n');
    }
  }

  private applyProgressLine(line: string): void {
    const partial = parseProgressPipe(line);
    if (!partial) return;

    this.accumulateProgress(partial);

    if (partial.progress === 'continue' || partial.progress === 'end') {
      this.callbacks.onProgress?.({ ...this.latestProgress });
    }
  }

  private accumulateProgress(partial: PartialProgress): void {
    if (typeof partial.frame === 'number') this.totalFrames = partial.frame;
    if (typeof partial.fps === 'number') this.latestProgress.fps = partial.fps;
    if (typeof partial.bitrateKbps === 'number') {
      this.latestProgress.bitrateKbps = partial.bitrateKbps;
    }
    if (typeof partial.speed === 'number') this.latestProgress.speed = partial.speed;
    if (typeof partial.sizeBytes === 'number') this.latestSizeBytes = partial.sizeBytes;

    if (typeof partial.outTimeUs === 'number') {
      const outTimeSec = partial.outTimeUs / 1_000_000;
      this.latestProgress.outTimeSec = outTimeSec;
      if (this.durationSec > 0) {
        this.latestProgress.pct = Math.min(100, (outTimeSec / this.durationSec) * 100);
        const remaining = this.durationSec - outTimeSec;
        const speed = this.latestProgress.speed;
        this.latestProgress.etaSec = speed > 0 ? remaining / speed : 0;
      }
    }
  }

  /**
   * Split stderr into lines, filter out the `frame=`/`size=` noise, and
   * forward each remaining line through the level categoriser as a
   * structured `LogLine`.
   */
  private handleStderr(chunk: Buffer): void {
    this.stderrBuffer += chunk.toString('utf-8');

    const lastNewline = this.stderrBuffer.lastIndexOf('\n');
    if (lastNewline === -1) return;

    const complete = this.stderrBuffer.slice(0, lastNewline);
    this.stderrBuffer = this.stderrBuffer.slice(lastNewline + 1);

    for (const line of filterLogLines(complete)) {
      const level = logLevelFromType(categorizeLog(line));
      this.emitLog(level, line);
    }
  }

  private emitLog(level: LogLine['level'], text: string): void {
    this.callbacks.onLog?.({
      ts: this.deps.now(),
      level,
      text,
    });
  }

  /**
   * Decide the effective audio plan for this job. When the user asked to
   * stream-copy audio but the source codec is incompatible with the target
   * container (see {@link shouldTranscodeAudio}), override the plan to
   * `aac-192k` so the encode doesn't die inside the MP4 muxer. Logs the
   * decision so the renderer can surface why audio was re-encoded.
   */
  private async applyAudioFallback(job: EncodeJob): Promise<EncodeJob> {
    if (job.settings.audio !== 'copy') return job;

    const sourceCodec = job.sourceAudioCodec ?? (await this.deps.probeAudioCodec?.(job.videoPath));

    if (!sourceCodec) return { ...job, sourceAudioCodec: sourceCodec };

    if (!shouldTranscodeAudio(sourceCodec, job.settings.container)) {
      return { ...job, sourceAudioCodec: sourceCodec };
    }

    this.emitLog(
      'info',
      `Audio fallback: source codec "${sourceCodec}" cannot be stream-copied ` +
        `into ${job.settings.container}; transcoding to AAC 192k.`
    );
    return {
      ...job,
      sourceAudioCodec: sourceCodec,
      settings: { ...job.settings, audio: 'aac-192k' },
    };
  }
}
