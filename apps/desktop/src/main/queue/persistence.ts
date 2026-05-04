/**
 * Queue persistence — atomic JSON snapshots at <userData>/queue.json.
 *
 * The manager calls `scheduleFlush(getSnapshot, 200)` after every state
 * mutation; the debounce coalesces bursts (e.g. fast retry + status change
 * + reorder) into a single disk write. `flushNow(getSnapshot)` is reserved
 * for the `before-quit` shutdown path — we want the latest state hitting
 * disk synchronously before the app exits.
 *
 * Atomic write pattern: serialize → `writeFile(tmp)` → `fs.rename(tmp, final)`.
 * `rename` is atomic on NTFS and POSIX, so a force-kill mid-write either
 * leaves the previous snapshot intact or reveals the new one fully — never
 * a half-written file.
 *
 * No new dependencies — node:fs/promises + node:path. The handover.md
 * `fix(desktop/build): bundle all deps except electron` hotfix flagged
 * electron-store-style ESM/CJS landmines; staying on node builtins avoids
 * that whole class of bug.
 */
import { app } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { QUEUE_SNAPSHOT_VERSION, type QueueSnapshot } from '@moekoder/shared';
import { createMainLogger } from '../logger';

const log = createMainLogger('queue:persistence');

/** Resolves the on-disk path lazily so `app.getPath('userData')` is only
 *  hit once the runtime has it (i.e. after `whenReady`). */
let cachedPath: string | null = null;
export const getQueuePath = (): string => {
  if (!cachedPath) {
    cachedPath = path.join(app.getPath('userData'), 'queue.json');
  }
  return cachedPath;
};

/** Test-only seam — lets the persistence test stub `app.getPath` by
 *  passing an explicit path. Production callers never set this. */
export const setQueuePathOverride = (override: string | null): void => {
  cachedPath = override;
};

const tmpPath = (final: string): string => `${final}.tmp`;

/**
 * Read + validate the on-disk snapshot. Returns `null` on:
 *   · file missing (first run)
 *   · corrupt JSON (warns; user gets a fresh queue, no crash)
 *   · version mismatch (warns; same outcome — start fresh)
 *
 * Successful reads are sanitized: progress is forced to `null` (it was never
 * meant to persist), logs are forced to `[]` (memory-only), and any item that
 * was `active` at force-kill time is demoted to `wait` with `attempts` reset
 * so a stuck status doesn't permanently block the queue.
 */
export const loadSnapshot = async (): Promise<QueueSnapshot | null> => {
  const filePath = getQueuePath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    log.warn('Failed to read queue snapshot:', err);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn('Corrupt queue.json — ignoring:', err);
    return null;
  }

  if (!isQueueSnapshot(parsed)) {
    log.warn('queue.json shape mismatch — ignoring');
    return null;
  }
  if (parsed.version !== QUEUE_SNAPSHOT_VERSION) {
    log.warn(`queue.json version ${parsed.version} != ${QUEUE_SNAPSHOT_VERSION}; starting fresh`);
    return null;
  }

  return sanitizeOnLoad(parsed);
};

/**
 * Atomically write the snapshot. Caller (the manager's `flushNow`) is
 * responsible for serialization order — concurrent writes from two flush
 * paths would race the rename even though the rename itself is atomic.
 */
export const saveSnapshot = async (snapshot: QueueSnapshot): Promise<void> => {
  const finalPath = getQueuePath();
  const tmp = tmpPath(finalPath);
  const json = JSON.stringify(stripTransient(snapshot), null, 2);
  await fs.writeFile(tmp, json, { encoding: 'utf-8' });
  await fs.rename(tmp, finalPath);
};

/**
 * Strip session-scoped fields before serializing. Per the persistence
 * shape: `progress` is always null on disk and `logs` always [].
 */
const stripTransient = (snapshot: QueueSnapshot): QueueSnapshot => ({
  ...snapshot,
  savedAt: Date.now(),
  items: snapshot.items.map(item => ({
    ...item,
    progress: null,
    logs: [],
  })),
});

/**
 * Boot recovery rules per the findings doc:
 *   - `active` → `wait` (force-kill couldn't update the status; attempts
 *     reset so the retry budget isn't burned by a process we never
 *     actually finished)
 *   - clear stale `progress` (already done by stripTransient on save, but
 *     also defensive on load in case an older snapshot leaked one through)
 *   - logs ← [] (memory-only)
 *
 * Source-file existence checks are done by the manager AFTER hydration so
 * the persistence layer stays sync-safe and dep-free of fs.stat probing.
 */
const sanitizeOnLoad = (snapshot: QueueSnapshot): QueueSnapshot => ({
  ...snapshot,
  // The dispatcher loop is restarted by the user, never auto — see the
  // findings doc's "boot recovery" rule. `paused` is reset for the same
  // reason; a paused queue from a prior session is just an idle one now.
  running: false,
  paused: false,
  items: snapshot.items.map(item => {
    const wasActive = item.status === 'active';
    return {
      ...item,
      status: wasActive ? 'wait' : item.status,
      attempts: wasActive ? 0 : item.attempts,
      progress: null,
      logs: [],
      startedAt: wasActive ? null : item.startedAt,
    };
  }),
});

/** Structural check on the parsed JSON so a hand-edited file can't crash us. */
const isQueueSnapshot = (value: unknown): value is QueueSnapshot => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.items) &&
    typeof obj.settings === 'object' &&
    obj.settings !== null
  );
};

// ─── debounced flush + sync flushNow ──────────────────────────────────────

type SnapshotProvider = () => QueueSnapshot;

let flushTimer: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;

/**
 * Coalesce a burst of mutations into a single write at most every
 * `delayMs` (default 200). The provider is captured fresh at flush time
 * so the latest snapshot wins; intermediate states are dropped.
 *
 * No backpressure — if the previous flush is still in flight we let it
 * finish and start a new one immediately so disk lag doesn't pile up.
 */
export const scheduleFlush = (provider: SnapshotProvider, delayMs = 200): void => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    inFlight = (async () => {
      try {
        await saveSnapshot(provider());
      } catch (err) {
        log.warn('Debounced queue flush failed:', err);
      }
    })();
  }, delayMs);
};

/**
 * Cancel any pending debounce, await the in-flight flush (if any), then
 * write the current snapshot synchronously. Used by `before-quit` so the
 * latest state hits disk before electron tears the process down.
 */
export const flushNow = async (provider: SnapshotProvider): Promise<void> => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (inFlight) {
    await inFlight.catch(() => undefined);
    inFlight = null;
  }
  try {
    await saveSnapshot(provider());
  } catch (err) {
    log.error('Final queue flush failed:', err);
  }
};

/** Test-only seam to drop in-memory flush state between tests. */
export const __resetFlushStateForTests = (): void => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  inFlight = null;
};
