/**
 * PSNR (Peak Signal-to-Noise Ratio) measurement helper.
 *
 * Spawns a one-shot ffmpeg run with the `psnr` filter to compute the
 * average PSNR between the original input and a candidate encode. Used
 * by benchmark mode (see `encode/benchmark.ts`) to score each candidate
 * profile beyond raw size + elapsed time.
 *
 * The filter graph compares the two inputs frame-for-frame; the summary
 * is written to stderr in the form:
 *
 *   [Parsed_psnr_0 @ ...] PSNR y:42.1 u:43.4 v:43.7 average:42.5 min:30.1 max:60.4
 *
 * We extract the `average:` token. PSNR over ~40 dB is broadly
 * indistinguishable; under 30 dB tends to look obviously degraded.
 *
 * Cost: a 10s 1080p clip computes in well under 2 seconds on modern
 * hardware, but the caller should still surface a "computing PSNR…"
 * stage to the user so the run doesn't look hung.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { getFfmpegPath } from '../utils/bin-paths';

/** Hard cap so a malformed candidate file can't hang the benchmark. */
const PSNR_TIMEOUT_MS = 60_000;

/** Match `average:NN.NN` or `average:inf` in the ffmpeg PSNR summary line. */
const AVG_RE = /average:(inf|[\d.]+)/i;

export interface PsnrDeps {
  spawn: (cmd: string, args: string[]) => ChildProcess;
  getFfmpegPath: () => string;
}

export const defaultPsnrDeps: PsnrDeps = {
  spawn: (cmd, args) => spawn(cmd, args, { windowsHide: true }),
  getFfmpegPath,
};

/**
 * Compute the average PSNR between two video files. Resolves with
 * `null` when ffmpeg succeeds but no `average:` line was emitted (rare —
 * usually means the candidate has no frames in common with the original
 * window). Rejects on spawn failure, non-zero exit, or timeout.
 *
 * `clipStartSec` seeks the original input to the same position that was
 * encoded, so the filter compares the correct frames rather than the
 * source head. The candidate is already trimmed to start at 0.
 */
export const computePsnr = async (
  originalPath: string,
  candidatePath: string,
  clipStartSec: number,
  clipDurationSec: number,
  deps: PsnrDeps = defaultPsnrDeps
): Promise<number | null> => {
  return new Promise<number | null>((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-nostats',
      // Input-level seek on the original so the comparison window matches
      // the encoded slice exactly. The candidate starts at 0.
      '-ss',
      String(clipStartSec),
      '-t',
      String(clipDurationSec),
      '-i',
      originalPath,
      '-i',
      candidatePath,
      '-lavfi',
      '[0:v][1:v]psnr',
      '-f',
      'null',
      '-',
    ];

    const child = deps.spawn(deps.getFfmpegPath(), args);
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      reject(new Error(`PSNR computation timed out after ${PSNR_TIMEOUT_MS}ms`));
    }, PSNR_TIMEOUT_MS);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();

    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf-8');
    });

    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`PSNR ffmpeg exited with code ${code ?? 'null'}: ${stderr.trim()}`));
        return;
      }
      const match = AVG_RE.exec(stderr);
      if (!match) {
        resolve(null);
        return;
      }
      const raw = match[1]!.toLowerCase();
      const value = raw === 'inf' ? Number.POSITIVE_INFINITY : Number.parseFloat(raw);
      resolve(Number.isFinite(value) || value === Number.POSITIVE_INFINITY ? value : null);
    });
  });
};
