/**
 * Queue manager — owns the in-memory queue + dispatcher loop.
 *
 * Design contract:
 *   - Module-level functional API (mirrors the encode orchestrator). The
 *     manager is a singleton — there's only ever one queue per app.
 *   - Drives encodes through `startEncode` so it inherits the preflight,
 *     active-jobs map, and SIGTERM-on-quit machinery without re-implementing
 *     anything.
 *   - Sets the orchestrator concurrency cap to `settings.concurrency` while
 *     `running && !paused`, restores it to 1 when the queue drains so the
 *     Single route's "another encode running" guarantee comes back.
 *   - Soft-pause: `paused = true` halts the dispatcher; in-flight items
 *     finish naturally. Per-card "Force stop" lives on a different code path
 *     (`cancelItem`) and goes through `cancelEncode`.
 *   - Retry policy: on processor error (non-cancel), if `attempts < maxRetries`
 *     reschedule the item back to `wait` after `backoffMs * 2^attempts`.
 *     Otherwise the item flips to `error` and the queue continues.
 *
 * Every state mutation calls `emitChange()`, which (a) sends a fresh
 * snapshot down `queue:changed` to the renderer and (b) debounce-flushes
 * to `queue.json`. Per-item progress + log events ride DEDICATED channels
 * so the per-card subscription tree never has to re-render the whole list
 * on every ffmpeg tick.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import {
  QUEUE_SNAPSHOT_VERSION,
  type NewQueueItem,
  type QueueItem,
  type QueueItemLogLine,
  type QueueItemProgress,
  type QueueSettings,
  type QueueSnapshot,
  type QueueStats,
} from '@moekoder/shared';
import { createMainLogger } from '../logger';
import { IpcError } from '../ipc/errors';
import {
  cancelEncode,
  getActiveJobIds,
  setConcurrencyCap,
  startEncode,
  type EncodeEvents,
} from '../encode/orchestrator';

const log = createMainLogger('queue:manager');

/** Per-item rolling log cap — same as `useEncodeStore`'s buffer. */
const MAX_LOGS_PER_ITEM = 500;

/** Optional sink for events the manager wants to push out. The IPC handler
 *  layer wires these to `webContents.send`; tests pass spies. */
export interface QueueManagerEvents {
  onChanged?: (snapshot: QueueSnapshot) => void;
  onItemProgress?: (itemId: string, progress: QueueItemProgress) => void;
  onItemLog?: (itemId: string, line: QueueItemLogLine) => void;
  /** Fired exactly once per running→idle transition (queue drained). */
  onQueueComplete?: (doneCount: number) => void;
}

/** Dependency seam for tests. */
export interface QueueManagerDeps {
  /** Schedule a debounced flush of the current snapshot. */
  scheduleFlush: (provider: () => QueueSnapshot) => void;
  /** Existence check for source / subtitle paths during boot recovery. */
  fileExists: (path: string) => Promise<boolean>;
  /** Wraps `startEncode` so tests can substitute a stub. */
  startEncode: typeof startEncode;
  /** Wraps `cancelEncode`. */
  cancelEncode: typeof cancelEncode;
  /** Lift / lower the orchestrator concurrency cap. */
  setConcurrencyCap: typeof setConcurrencyCap;
  /** UUID factory for new items. Override in tests for deterministic ids. */
  newItemId: () => string;
  /** `Date.now()` seam. */
  now: () => number;
  /** Schedule a retry — defaults to `setTimeout`. Tests pass a fake-timer
   *  setter so retries are deterministic. */
  scheduleRetry: (fn: () => void, ms: number) => void;
}

const defaultDeps = (): QueueManagerDeps => ({
  // Lazy-loaded so tests can stub before initManager runs.
  scheduleFlush: () => {},
  fileExists: async (p: string) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  },
  startEncode,
  cancelEncode,
  setConcurrencyCap,
  newItemId: () => randomUUID(),
  now: () => Date.now(),
  scheduleRetry: (fn, ms) => {
    setTimeout(fn, ms).unref?.();
  },
});

const DEFAULT_SETTINGS: QueueSettings = {
  concurrency: 1,
  maxRetries: 2,
  backoffMs: 4000,
  encoding: {},
};

interface ManagerState {
  items: QueueItem[];
  /** Maps queue-item id → orchestrator jobId for the in-flight processors. */
  jobIdByItemId: Map<string, string>;
  settings: QueueSettings;
  running: boolean;
  paused: boolean;
}

const state: ManagerState = {
  items: [],
  jobIdByItemId: new Map(),
  settings: { ...DEFAULT_SETTINGS },
  running: false,
  paused: false,
};

let events: QueueManagerEvents = {};
let deps: QueueManagerDeps = defaultDeps();

/** Test seam — replace the manager's deps wholesale. */
export const __setManagerDepsForTests = (next: Partial<QueueManagerDeps>): void => {
  deps = { ...defaultDeps(), ...next };
};

/** Test seam — wipe state between tests. */
export const __resetManagerStateForTests = (): void => {
  state.items = [];
  state.jobIdByItemId = new Map();
  state.settings = { ...DEFAULT_SETTINGS };
  state.running = false;
  state.paused = false;
  events = {};
};

/**
 * One-shot init. Call after `app.whenReady` and the main window exists,
 * but before `registerAllIpcHandlers` so the manager is ready to answer
 * `queue:get-snapshot` the moment the renderer mounts.
 *
 * `hydrateFromSnapshot` applies the boot-recovery rules (active→wait,
 * source-missing→error). The dispatcher loop is NOT auto-started — the
 * user must explicitly click Start, even if the queue was running pre-quit.
 * Safer than auto-resume: a force-kill mid-encode might have left the user
 * deliberately wanting to inspect things first.
 */
export const initQueueManager = async (
  evts: QueueManagerEvents,
  initial: { snapshot: QueueSnapshot | null; settings?: Partial<QueueSettings> },
  managerDeps?: Partial<QueueManagerDeps>
): Promise<void> => {
  events = evts;
  if (managerDeps) {
    deps = { ...defaultDeps(), ...managerDeps };
  } else {
    deps = defaultDeps();
  }

  if (initial.snapshot) {
    state.items = initial.snapshot.items;
    state.settings = { ...DEFAULT_SETTINGS, ...initial.snapshot.settings };
    // Boot recovery — already mostly done by sanitizeOnLoad, but the
    // source-existence sweep is async and lives here so the persistence
    // layer stays sync-safe.
    await sweepMissingSources();
  }
  if (initial.settings) {
    state.settings = { ...state.settings, ...initial.settings };
  }
};

const sweepMissingSources = async (): Promise<void> => {
  for (const item of state.items) {
    if (item.status === 'done' || item.status === 'cancelled' || item.status === 'error') continue;
    const [videoOk, subsOk] = await Promise.all([
      deps.fileExists(item.videoPath),
      deps.fileExists(item.subtitlePath),
    ]);
    if (!videoOk || !subsOk) {
      item.status = 'error';
      item.lastError = 'Source file missing';
      log.warn(`Boot-sweep: item ${item.id} missing sources, demoted to error`);
    }
  }
};

/** Snapshot for IPC + persistence. */
export const getSnapshot = (): QueueSnapshot => ({
  version: QUEUE_SNAPSHOT_VERSION,
  savedAt: deps.now(),
  settings: { ...state.settings },
  items: state.items.map(item => ({ ...item, logs: item.logs.slice(), progress: item.progress })),
  running: state.running,
  paused: state.paused,
});

export const getStats = (): QueueStats => {
  const stats: QueueStats = { total: 0, wait: 0, active: 0, done: 0, error: 0, cancelled: 0 };
  for (const item of state.items) {
    stats.total += 1;
    stats[item.status] += 1;
  }
  return stats;
};

/** Fan out a state change: snapshot → renderer + scheduleFlush → disk. */
const emitChange = (): void => {
  const snap = getSnapshot();
  events.onChanged?.(snap);
  deps.scheduleFlush(getSnapshot);
};

// ─── mutators ────────────────────────────────────────────────────────────

export const addItems = (newItems: NewQueueItem[]): string[] => {
  const ids: string[] = [];
  for (const input of newItems) {
    const id = deps.newItemId();
    state.items.push({
      id,
      videoPath: input.videoPath,
      videoName: input.videoName,
      subtitlePath: input.subtitlePath,
      subtitleName: input.subtitleName,
      outputPath: input.outputPath,
      status: 'wait',
      progress: null,
      attempts: 0,
      lastError: null,
      addedAt: deps.now(),
      startedAt: null,
      completedAt: null,
      logs: [],
    });
    ids.push(id);
  }
  emitChange();
  // If the dispatcher is already running, the new items get picked up on
  // the next `processNext` tick. If we're idle, the user has to click Start.
  if (state.running && !state.paused) processNext();
  return ids;
};

export const removeItem = (itemId: string): boolean => {
  const idx = state.items.findIndex(i => i.id === itemId);
  if (idx === -1) return false;
  const item = state.items[idx];
  // Active items get force-stopped first so the orchestrator releases the
  // ffmpeg child before we forget the item id.
  if (item.status === 'active') {
    cancelItem(itemId);
  }
  state.items.splice(idx, 1);
  emitChange();
  return true;
};

export const reorderItem = (fromIndex: number, toIndex: number): void => {
  if (fromIndex < 0 || fromIndex >= state.items.length) return;
  if (toIndex < 0 || toIndex >= state.items.length) return;
  if (fromIndex === toIndex) return;
  const [moved] = state.items.splice(fromIndex, 1);
  state.items.splice(toIndex, 0, moved);
  emitChange();
};

export const updateItemOutput = (itemId: string, newOutputPath: string): boolean => {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return false;
  if (item.status === 'active') return false;
  item.outputPath = newOutputPath;
  emitChange();
  return true;
};

export const clearDone = (): void => {
  const before = state.items.length;
  state.items = state.items.filter(i => i.status !== 'done');
  if (state.items.length !== before) emitChange();
};

export const setSettings = (partial: Partial<QueueSettings>): QueueSettings => {
  state.settings = { ...state.settings, ...partial };
  if (state.running && !state.paused) {
    deps.setConcurrencyCap(state.settings.concurrency);
    // The cap was just raised — try to dispatch any waiting items that
    // were blocked by the old cap.
    processNext();
  }
  emitChange();
  return { ...state.settings };
};

/**
 * Start the dispatcher. Throws if the Single route currently holds an
 * active encode (cap is 1 → at least one job is on the orchestrator) or
 * if the queue is empty / has no waiting items.
 */
export const start = (): void => {
  // Reject when the Single route is mid-encode. The orchestrator's
  // active-jobs map is the source of truth: if anything's there and our
  // own queue isn't responsible for it, it's a Single-route encode.
  const ourJobs = new Set(state.jobIdByItemId.values());
  const foreignActive = getActiveJobIds().some(id => !ourJobs.has(id));
  if (foreignActive) {
    throw new IpcError('UNAVAILABLE', 'An encode is already running on Single. Stop it first.');
  }
  state.running = true;
  state.paused = false;
  deps.setConcurrencyCap(state.settings.concurrency);
  emitChange();
  processNext();
};

export const pause = (): void => {
  if (!state.running) return;
  state.paused = true;
  emitChange();
};

export const resume = (): void => {
  if (!state.running) return;
  state.paused = false;
  emitChange();
  processNext();
};

/**
 * Cancel an in-flight item via SIGTERM. Returns true if the item was
 * active. Non-active items can be removed via `removeItem` instead — this
 * is for the per-card "Force stop" affordance only.
 */
export const cancelItem = (itemId: string): boolean => {
  const jobId = state.jobIdByItemId.get(itemId);
  if (!jobId) return false;
  return deps.cancelEncode(jobId);
};

/**
 * Reset an `error` or `cancelled` item back to `wait` so it gets another
 * shot. Resets the attempts counter and clears `lastError`. The dispatcher
 * picks it up on the next tick.
 */
export const retryItem = (itemId: string): boolean => {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return false;
  if (item.status !== 'error' && item.status !== 'cancelled') return false;
  item.status = 'wait';
  item.attempts = 0;
  item.lastError = null;
  item.startedAt = null;
  item.completedAt = null;
  emitChange();
  if (state.running && !state.paused) processNext();
  return true;
};

/**
 * Tear-down: cancel every active queue item and wait for them to settle.
 * Called from `before-quit` so the app doesn't exit while a queue encode
 * is still writing frames. Returns once every job has reported via
 * `onComplete` / `onError`.
 *
 * Distinct from the orchestrator's `cancelAllEncodes` because that one
 * also kills Single-route jobs. Here we only touch ours.
 */
export const cancelAll = async (): Promise<void> => {
  state.running = false;
  state.paused = false;
  for (const itemId of [...state.jobIdByItemId.keys()]) {
    cancelItem(itemId);
  }
  // Wait for the orchestrator to drain. Polling once per microtask is
  // enough — the processor's close handler fires synchronously after SIGTERM
  // is acknowledged by the child.
  await new Promise<void>(resolve => {
    const tick = (): void => {
      if (state.jobIdByItemId.size === 0) resolve();
      else setImmediate(tick);
    };
    tick();
  });
};

// ─── dispatcher ──────────────────────────────────────────────────────────

const findNextWaiting = (): QueueItem | null => {
  return state.items.find(i => i.status === 'wait') ?? null;
};

const isQueueDrained = (): boolean => {
  return !state.items.some(i => i.status === 'wait' || i.status === 'active');
};

const dispatchOne = (item: QueueItem): void => {
  item.status = 'active';
  item.startedAt = deps.now();
  item.progress = null;
  item.lastError = null;
  emitChange();

  const eventsForOrch: EncodeEvents = {
    onProgress: (_jobId, progress) => {
      // Mirror progress into the item snapshot AND fan out a per-item
      // event so renderer cards can subscribe with item-id selectors.
      item.progress = progress;
      events.onItemProgress?.(item.id, progress);
    },
    onLog: (_jobId, line) => {
      // Cap the in-memory buffer; persistence drops it entirely.
      item.logs.push(line);
      if (item.logs.length > MAX_LOGS_PER_ITEM) {
        item.logs.splice(0, item.logs.length - MAX_LOGS_PER_ITEM);
      }
      events.onItemLog?.(item.id, line);
    },
    onComplete: (_jobId, _result) => {
      state.jobIdByItemId.delete(item.id);
      item.status = 'done';
      item.completedAt = deps.now();
      item.progress = null;
      emitChange();
      maybeAnnounceComplete();
      processNext();
    },
    onError: (_jobId, error) => {
      state.jobIdByItemId.delete(item.id);
      item.progress = null;
      item.completedAt = deps.now();
      if (error.code === 'CANCELLED') {
        item.status = 'cancelled';
        item.lastError = error.message;
        emitChange();
        // A user-cancelled item never auto-retries. Continue with the next.
        processNext();
        return;
      }
      // Retry budget?
      const remaining = state.settings.maxRetries - item.attempts;
      if (remaining > 0) {
        item.attempts += 1;
        item.lastError = `${error.message} (retry ${item.attempts}/${state.settings.maxRetries})`;
        item.status = 'wait';
        const backoff = state.settings.backoffMs * 2 ** (item.attempts - 1);
        emitChange();
        deps.scheduleRetry(() => {
          if (state.running && !state.paused) processNext();
        }, backoff);
        return;
      }
      item.status = 'error';
      item.lastError = error.message;
      emitChange();
      maybeAnnounceComplete();
      processNext();
    },
  };

  // Kick off the encode. The orchestrator returns the jobId synchronously
  // after the preflight + spawn — record the mapping so cancellations can
  // reach the right child.
  deps
    .startEncode(
      {
        videoPath: item.videoPath,
        subtitlePath: item.subtitlePath,
        outputPath: item.outputPath,
        settings: state.settings.encoding,
      },
      eventsForOrch
    )
    .then(({ jobId }) => {
      state.jobIdByItemId.set(item.id, jobId);
    })
    .catch(err => {
      // Preflight failure (UNAVAILABLE / out of disk) — same retry flow as
      // a runtime error. The orchestrator's `events.onError` callback never
      // fires for thrown-from-startEncode errors because the processor was
      // never created, so we emulate it inline.
      const code = (err as { code?: string }).code ?? 'INTERNAL';
      const message = err instanceof Error ? err.message : String(err);
      eventsForOrch.onError(item.id, { code, message });
    });
};

const processNext = (): void => {
  if (!state.running || state.paused) return;
  while (state.jobIdByItemId.size < state.settings.concurrency) {
    const next = findNextWaiting();
    if (!next) break;
    dispatchOne(next);
  }
  // If we just ran past the last waiting item and nothing's active, wind
  // down. The "queue complete" notification fires once on the actual
  // running→idle transition, not on every tick.
  if (isQueueDrained() && state.running) {
    state.running = false;
    deps.setConcurrencyCap(1);
    emitChange();
    maybeAnnounceComplete();
  }
};

/**
 * Fire the queue-complete notification exactly once per logical run.
 * Triggered when the queue transitions to drained (no wait, no active)
 * while `running` was true and not paused / not cancelled. The
 * `running = false` flip in `processNext` happens just before this is
 * called, so we read `done` count off the items directly.
 */
let lastAnnouncedAt = 0;
const maybeAnnounceComplete = (): void => {
  // Debounce: a multi-cap drain can flip running→false on the LAST item's
  // close handler, but the previous calls may have already triggered. We
  // lean on the wall-clock to guard against double-fire within a tick.
  if (state.running) return;
  if (!isQueueDrained()) return;
  const now = deps.now();
  if (now - lastAnnouncedAt < 1000) return;
  lastAnnouncedAt = now;
  const doneCount = state.items.filter(i => i.status === 'done').length;
  if (doneCount === 0) return; // Nothing actually completed (all errored / cancelled)
  events.onQueueComplete?.(doneCount);
};
