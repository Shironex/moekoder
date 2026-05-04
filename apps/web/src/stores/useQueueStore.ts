import { create } from 'zustand';
import type {
  QueueItem,
  QueueItemLogLine,
  QueueItemProgress,
  QueueSettings,
  QueueSnapshot,
} from '@moekoder/shared';

/** Per-item log buffer cap — matches the manager's MAX_LOGS_PER_ITEM and
 *  the `useEncodeStore` rolling buffer. */
const MAX_LOGS_PER_ITEM = 500;

/**
 * Renderer-side mirror of the queue. Hydrates from `queue:get-snapshot`
 * on mount and reconciles via `queue:changed` thereafter; per-item progress
 * + log streams hit dedicated setters so cards can subscribe with targeted
 * selectors and avoid re-rendering on every ffmpeg tick (same lesson the
 * v0.1.0 useEncodeStore learned).
 *
 * Persistence is owned by the main process — never write to electron-store
 * from this slice. Settings here are mirrored in `UserSettings` for the
 * subset that the user controls (concurrency, retries, backoff).
 */
interface QueueState {
  items: QueueItem[];
  settings: QueueSettings;
  running: boolean;
  paused: boolean;
  /** Whether the renderer has received its first snapshot yet. */
  hydrated: boolean;
  applySnapshot: (snapshot: QueueSnapshot) => void;
  applyItemProgress: (itemId: string, progress: QueueItemProgress) => void;
  applyItemLog: (itemId: string, line: QueueItemLogLine) => void;
}

const INITIAL_SETTINGS: QueueSettings = {
  concurrency: 1,
  maxRetries: 2,
  backoffMs: 4000,
  encoding: {},
};

export const useQueueStore = create<QueueState>(set => ({
  items: [],
  settings: INITIAL_SETTINGS,
  running: false,
  paused: false,
  hydrated: false,
  applySnapshot: snapshot =>
    set({
      items: snapshot.items,
      settings: snapshot.settings,
      running: snapshot.running,
      paused: snapshot.paused,
      hydrated: true,
    }),
  applyItemProgress: (itemId, progress) =>
    set(state => ({
      items: state.items.map(item => (item.id === itemId ? { ...item, progress } : item)),
    })),
  applyItemLog: (itemId, line) =>
    set(state => ({
      items: state.items.map(item => {
        if (item.id !== itemId) return item;
        const next =
          item.logs.length >= MAX_LOGS_PER_ITEM
            ? [...item.logs.slice(item.logs.length - MAX_LOGS_PER_ITEM + 1), line]
            : [...item.logs, line];
        return { ...item, logs: next };
      }),
    })),
}));

/**
 * Targeted selector for per-card progress. Cards call
 * `useQueueStore(selectItemProgress(id))` so a progress event for item B
 * never re-renders item A's card.
 */
export const selectItemProgress =
  (itemId: string) =>
  (s: QueueState): QueueItemProgress | null =>
    s.items.find(i => i.id === itemId)?.progress ?? null;

/**
 * Aggregate counters derived once per snapshot mutation. Cheap because the
 * queue is bounded (<50 items in normal use); deriving outside the store
 * keeps the state shape minimal.
 */
export const selectStats = (s: QueueState) => {
  let wait = 0;
  let active = 0;
  let done = 0;
  let error = 0;
  let cancelled = 0;
  for (const item of s.items) {
    if (item.status === 'wait') wait += 1;
    else if (item.status === 'active') active += 1;
    else if (item.status === 'done') done += 1;
    else if (item.status === 'error') error += 1;
    else if (item.status === 'cancelled') cancelled += 1;
  }
  return { total: s.items.length, wait, active, done, error, cancelled };
};
