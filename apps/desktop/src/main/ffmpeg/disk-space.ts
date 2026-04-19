/**
 * Disk-space preflight for encode jobs.
 *
 * Uses Node 18.15+ `fs.statfs` — no PowerShell, no wmic, no native add-on.
 * Works uniformly on Windows, macOS, Linux.
 *
 * Estimation math is bitrate-driven: `(kbps * seconds * 1024) / 8` bytes.
 * Callers feed the per-preset `BALANCED_BITRATE_KBPS` constant when they
 * don't have real probe data yet (first render, user hasn't probed).
 */
import * as fs from 'node:fs/promises';

/**
 * Returns free disk space (bytes) for the filesystem that hosts `dir`.
 * `bavail` reflects the blocks available to a non-root user, which is the
 * honest answer — `bfree` includes root-reserved blocks we can't touch.
 */
export const getFreeBytes = async (dir: string): Promise<number> => {
  const stats = await fs.statfs(dir);
  return stats.bavail * stats.bsize;
};

/**
 * Rough size estimate for a CBR/VBR encode: `(kbps * seconds * 1024) / 8`.
 * Kibi-denominated `1024` matches how ffmpeg reports `bitrate=... kbits/s`
 * in stderr — close enough for a preflight check. Rounded up so we never
 * under-reserve.
 */
export const estimateOutputBytes = (durationSec: number, targetBitrateKbps: number): number => {
  if (durationSec <= 0 || targetBitrateKbps <= 0) return 0;
  return Math.ceil((targetBitrateKbps * durationSec * 1024) / 8);
};

/** 200 MiB safety margin — covers audio stream, muxer overhead, headroom. */
export const DEFAULT_SAFETY_MARGIN_BYTES = 200 * 1024 * 1024;

export interface PreflightResult {
  freeBytes: number;
  estimatedBytes: number;
  /** Safety margin added on top of the estimate before checking free space. */
  safetyMarginBytes: number;
  ok: boolean;
  /** Bytes needed beyond what's free; `0` when ok. */
  shortfallBytes: number;
}

/**
 * Checks whether `outputDir` has enough free space to hold the estimated
 * encode output plus a safety margin. Does NOT throw on shortfall —
 * returns `ok: false` + `shortfallBytes` so the orchestrator can surface a
 * structured `IpcError('UNAVAILABLE', …)` with the numbers attached.
 */
export const checkPreflight = async (
  outputDir: string,
  durationSec: number,
  targetBitrateKbps: number,
  safetyMarginBytes: number = DEFAULT_SAFETY_MARGIN_BYTES
): Promise<PreflightResult> => {
  const freeBytes = await getFreeBytes(outputDir);
  const estimatedBytes = estimateOutputBytes(durationSec, targetBitrateKbps);
  const required = estimatedBytes + safetyMarginBytes;
  const ok = freeBytes >= required;

  return {
    freeBytes,
    estimatedBytes,
    safetyMarginBytes,
    ok,
    shortfallBytes: ok ? 0 : required - freeBytes,
  };
};
