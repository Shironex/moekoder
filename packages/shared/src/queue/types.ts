/**
 * Queue-domain types shared between the desktop main process and the
 * renderer. Stays runtime-dep-free (no electron, no zod, no node) so the
 * renderer bundle can pull this without a polyfill cascade.
 *
 * Mirrors the persistence schema documented in
 * `docs/research/2026-05-04-v0.3.0-batch-queue.md`. When the on-disk shape
 * needs to change in a way that older snapshots can't read, bump
 * `QUEUE_SNAPSHOT_VERSION` and add a migration path in
 * `apps/desktop/src/main/queue/persistence.ts`.
 */

/**
 * Status names match the `q-badge` classes in `docs/Moekoder/styles.css`
 * (Wait / Live / Done) and the roadmap copy. Older AG-Wypalarka used
 * `pending / processing / completed` — Moekoder ports the renames, no
 * compat layer.
 */
export type QueueItemStatus = 'wait' | 'active' | 'done' | 'error' | 'cancelled';

/**
 * Streaming progress payload sent on `queue:item:progress`. Structurally
 * identical to the encode-route progress shape so the renderer can reuse
 * the same formatters.
 */
export interface QueueItemProgress {
  pct: number;
  fps: number;
  bitrateKbps: number;
  speed: number;
  outTimeSec: number;
  etaSec: number;
}

/** Log line for `queue:item:log` and the in-memory per-item buffer. */
export interface QueueItemLogLine {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'trace';
  text: string;
}

/**
 * One queue item. The on-disk JSON form always has `progress: null` and
 * `logs: []` — both are session-scoped and re-derived from in-flight events
 * after rehydration. Persisting them would bloat queue.json and serve no
 * recovery purpose since canceled / partial output is deleted on cancel.
 */
export interface QueueItem {
  /** `crypto.randomUUID()` — stable across reboots so renderer card keys survive. */
  id: string;
  videoPath: string;
  videoName: string;
  subtitlePath: string;
  subtitleName: string;
  outputPath: string;
  status: QueueItemStatus;
  progress: QueueItemProgress | null;
  /** How many additional attempts have been made (0 = first attempt). */
  attempts: number;
  /** Last error message surfaced for this item (cleared on success/retry). */
  lastError: string | null;
  /** Wall-clock when the item entered the queue. */
  addedAt: number;
  /** Wall-clock when the most recent attempt began. `null` until first dispatch. */
  startedAt: number | null;
  /** Wall-clock of the terminal transition. `null` for in-flight or pending items. */
  completedAt: number | null;
  /** Per-item rolling log buffer. Memory-only: never persisted, capped at 500. */
  logs: QueueItemLogLine[];
}

/**
 * Input shape for `queue:add-items`. Renderer hands over the three paths
 * + filenames; the manager assigns the id, status (`wait`), timestamps,
 * and counters.
 */
export interface NewQueueItem {
  videoPath: string;
  videoName: string;
  subtitlePath: string;
  subtitleName: string;
  outputPath: string;
}

/**
 * Queue-level settings. `encoding` carries the partial preset overrides
 * that should apply to every item the queue starts; the manager merges it
 * onto `BALANCED_PRESET` at dispatch time the same way the Single route
 * does. v0.3 has no per-item override mechanism.
 */
export interface QueueSettings {
  concurrency: 1 | 2 | 3 | 4;
  maxRetries: number;
  backoffMs: number;
  /** Loose record so the renderer doesn't import the desktop's EncodingSettings shape. */
  encoding: Record<string, unknown>;
}

/** Aggregate counters surfaced on the queue screen. */
export interface QueueStats {
  total: number;
  wait: number;
  active: number;
  done: number;
  error: number;
  cancelled: number;
}

/**
 * Persistence payload (also the response of `queue:get-snapshot` and the
 * payload of every `queue:changed` event). Renderer reconciles this into
 * its Zustand store on each emit.
 */
export interface QueueSnapshot {
  version: typeof QUEUE_SNAPSHOT_VERSION;
  /** `Date.now()` at write time. Monotonic in the steady state. */
  savedAt: number;
  settings: QueueSettings;
  items: QueueItem[];
  /** Whether the dispatcher loop is running (Start clicked). */
  running: boolean;
  /** Whether soft-pause is engaged. In-flight items keep going; new dispatch waits. */
  paused: boolean;
}

/** Bumps when the on-disk shape changes in a non-additive way. */
export const QUEUE_SNAPSHOT_VERSION = 1 as const;

/** Per-item progress payload over `queue:item:progress`. */
export interface QueueItemProgressEvent {
  itemId: string;
  progress: QueueItemProgress;
}

/** Per-item log payload over `queue:item:log`. */
export interface QueueItemLogEvent {
  itemId: string;
  line: QueueItemLogLine;
}
