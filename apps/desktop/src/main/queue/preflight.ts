/**
 * Total-queue disk-space preflight.
 *
 * Runs at `manager.start()` time. Sums the estimated output size across
 * every `wait` item, grouped by `dirname(outputPath)`, then asks the
 * filesystem (once per unique dir) how many bytes are free. Throws an
 * `IpcError('UNAVAILABLE', …)` listing every shortfall when the user
 * couldn't actually fit the whole queue — the per-item preflight that
 * the orchestrator runs at dispatch time would have eventually caught
 * this too, but only one item at a time, after partial work was already
 * burned. Failing fast at Start spares the wasted GPU minutes.
 *
 * The estimation formula matches the per-item `disk-space.ts` helper —
 * `BALANCED_BITRATE_KBPS * durationSec` plus a per-item safety margin —
 * so the two preflights agree on shortfall numbers.
 *
 * `done`, `error`, `cancelled`, and `active` items are skipped: only
 * waiting work counts toward the budget. Resume() is intentionally NOT
 * preflighted (the items were already approved when `start()` ran).
 */
import * as path from 'node:path';
import {
  DEFAULT_SAFETY_MARGIN_BYTES,
  estimateOutputBytes,
  getFreeBytes,
} from '../ffmpeg/disk-space';
import { probe } from '../ffmpeg/probe';
import { BALANCED_BITRATE_KBPS } from '../ffmpeg/settings';
import { IpcError } from '../ipc/errors';
import type { QueueItem } from '@moekoder/shared';

export interface DirShortfall {
  dir: string;
  requiredBytes: number;
  freeBytes: number;
  shortfallBytes: number;
}

export interface QueuePreflightDeps {
  /** Returns the duration (seconds) for a video file. Default uses ffprobe. */
  probeDuration: (videoPath: string) => Promise<number>;
  /** Returns free bytes for the filesystem hosting `dir`. */
  getFreeBytes: (dir: string) => Promise<number>;
}

const defaultDeps = (): QueuePreflightDeps => ({
  probeDuration: async videoPath => (await probe(videoPath)).durationSec,
  getFreeBytes,
});

export interface PreflightSummary {
  /** Per-directory required vs. free bytes. Always populated, even on success. */
  directories: Array<{ dir: string; requiredBytes: number; freeBytes: number }>;
  shortfalls: DirShortfall[];
  /** Wait-items the preflight actually accounted for. */
  itemsConsidered: number;
}

/**
 * Sums per-directory required output bytes, compares against free space,
 * and throws when any directory is short. Resolves silently on success.
 *
 * The function never partially-rejects — it surveys every directory before
 * throwing so the error body lists every shortfall in one shot, not one
 * per click.
 */
export const preflightQueue = async (
  items: QueueItem[],
  bitrateKbps: number = BALANCED_BITRATE_KBPS,
  safetyMarginBytes: number = DEFAULT_SAFETY_MARGIN_BYTES,
  deps: QueuePreflightDeps = defaultDeps()
): Promise<PreflightSummary> => {
  const waiting = items.filter(i => i.status === 'wait');
  if (waiting.length === 0) {
    return { directories: [], shortfalls: [], itemsConsidered: 0 };
  }

  // Probe in parallel so the Start click doesn't stall serially across N
  // items. Each probe is small but the round-trip latency adds up at
  // queue sizes of 20+. ffprobe is happy to run concurrent invocations.
  const durations = await Promise.all(
    waiting.map(async item => {
      try {
        const durationSec = await deps.probeDuration(item.videoPath);
        return { item, durationSec, ok: true as const };
      } catch (err) {
        // A probe failure here is recoverable — the per-item preflight
        // run by the orchestrator at dispatch time will surface a
        // structured error then. Treat duration as 0 so we don't reserve
        // bytes for an item that may never even start.
        return {
          item,
          durationSec: 0,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  // Group estimated bytes by output directory.
  const requiredByDir = new Map<string, number>();
  for (const probed of durations) {
    const dir = path.dirname(probed.item.outputPath);
    const itemBytes = estimateOutputBytes(probed.durationSec, bitrateKbps) + safetyMarginBytes;
    requiredByDir.set(dir, (requiredByDir.get(dir) ?? 0) + itemBytes);
  }

  // One free-space probe per unique dir.
  const directories: PreflightSummary['directories'] = [];
  const shortfalls: DirShortfall[] = [];
  for (const [dir, requiredBytes] of requiredByDir) {
    let freeBytes: number;
    try {
      freeBytes = await deps.getFreeBytes(dir);
    } catch (err) {
      // If we can't even measure the directory, surface that as a
      // shortfall — the orchestrator's per-item preflight would fail
      // here too. Reporting `freeBytes: 0` makes the error body honest
      // about the unknowns.
      freeBytes = 0;
      const message = err instanceof Error ? err.message : String(err);
      shortfalls.push({
        dir: `${dir} (${message})`,
        requiredBytes,
        freeBytes: 0,
        shortfallBytes: requiredBytes,
      });
      directories.push({ dir, requiredBytes, freeBytes });
      continue;
    }
    directories.push({ dir, requiredBytes, freeBytes });
    if (freeBytes < requiredBytes) {
      shortfalls.push({
        dir,
        requiredBytes,
        freeBytes,
        shortfallBytes: requiredBytes - freeBytes,
      });
    }
  }

  if (shortfalls.length > 0) {
    const summary = shortfalls
      .map(
        s =>
          `${s.dir}: needs ${formatBytes(s.requiredBytes)}, free ${formatBytes(s.freeBytes)} (short ${formatBytes(s.shortfallBytes)})`
      )
      .join('; ');
    throw new IpcError(
      'UNAVAILABLE',
      `Insufficient disk space for queue across ${shortfalls.length} ${shortfalls.length === 1 ? 'directory' : 'directories'}: ${summary}`,
      { shortfalls, directories }
    );
  }

  return {
    directories,
    shortfalls: [],
    itemsConsidered: waiting.length,
  };
};

/** Compact byte formatter for the error message. Avoid pulling in a
 *  dep — this is shown inside an IpcError that the renderer already
 *  needs to format on its own. */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
};
