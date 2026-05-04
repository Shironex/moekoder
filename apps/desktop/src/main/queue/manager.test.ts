import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EncodeStartResult } from '../encode/orchestrator';

// Stub electron — the manager doesn't import electron directly, but its
// `logger` import touches `electron.app`.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

vi.mock('../logger', () => ({
  createMainLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }),
}));

import {
  __resetManagerStateForTests,
  __setManagerDepsForTests,
  addItems,
  cancelAll,
  cancelItem,
  clearDone,
  getSnapshot,
  initQueueManager,
  pause,
  removeItem,
  reorderItem,
  resume,
  retryItem,
  setSettings,
  start,
} from './manager';
import type { EncodeEvents } from '../encode/orchestrator';

interface EncodeHandle {
  jobId: string;
  events: EncodeEvents;
  cancelled: boolean;
}

let nextJobCounter = 0;
let activeEncodes: Map<string, EncodeHandle>;
let scheduledRetries: Array<{ fn: () => void; ms: number }>;
let nextItemCounter = 0;
let onChanged: ReturnType<typeof vi.fn>;
let onItemProgress: ReturnType<typeof vi.fn>;
let onItemLog: ReturnType<typeof vi.fn>;
let onQueueComplete: ReturnType<typeof vi.fn>;

const buildStubs = (initialFiles: Set<string> = new Set()) => ({
  fileExists: async (p: string) => initialFiles.size === 0 || initialFiles.has(p),
  setConcurrencyCap: vi.fn(),
  cancelEncode: ((jobId: string) => {
    const handle = [...activeEncodes.values()].find(h => h.jobId === jobId);
    if (!handle) return false;
    handle.cancelled = true;
    // Mimic the orchestrator's cancellation flow — fire onError with code CANCELLED.
    handle.events.onError(jobId, { code: 'CANCELLED', message: 'Encode cancelled' });
    activeEncodes.delete(jobId);
    return true;
  }) as never,
  startEncode: (async (_input: unknown, evts: EncodeEvents): Promise<EncodeStartResult> => {
    const jobId = `job-${++nextJobCounter}`;
    const handle: EncodeHandle = { jobId, events: evts, cancelled: false };
    activeEncodes.set(jobId, handle);
    return Promise.resolve({
      jobId,
      preflight: {
        ok: true,
        freeBytes: 1,
        estimatedBytes: 1,
        safetyMarginBytes: 0,
        shortfallBytes: 0,
      },
    });
  }) as never,
  newItemId: () => `item-${++nextItemCounter}`,
  now: () => 1_000_000 + nextItemCounter,
  scheduleFlush: () => {},
  scheduleRetry: (fn: () => void, ms: number) => {
    scheduledRetries.push({ fn, ms });
  },
});

const installManagerWithStubs = async (
  initialFiles: Set<string> = new Set(),
  snapshot: Parameters<typeof initQueueManager>[1]['snapshot'] = null
): Promise<void> => {
  __resetManagerStateForTests();
  nextJobCounter = 0;
  nextItemCounter = 0;
  activeEncodes = new Map();
  scheduledRetries = [];
  onChanged = vi.fn();
  onItemProgress = vi.fn();
  onItemLog = vi.fn();
  onQueueComplete = vi.fn();

  await initQueueManager(
    { onChanged, onItemProgress, onItemLog, onQueueComplete },
    { snapshot },
    buildStubs(initialFiles)
  );
};
// Keep the unused-import escape valve so vitest doesn't complain when the
// test trims out direct usage.
void __setManagerDepsForTests;

const fireFinish = (jobId: string): void => {
  const handle = [...activeEncodes.values()].find(h => h.jobId === jobId);
  if (!handle) throw new Error(`unknown jobId ${jobId}`);
  handle.events.onComplete(jobId, {
    outputPath: '/out.mp4',
    durationSec: 60,
    avgFps: 48,
    outputBytes: 1,
    elapsedMs: 1,
  });
  activeEncodes.delete(jobId);
};

const fireFail = (jobId: string, code = 'INTERNAL', message = 'boom'): void => {
  const handle = [...activeEncodes.values()].find(h => h.jobId === jobId);
  if (!handle) throw new Error(`unknown jobId ${jobId}`);
  handle.events.onError(jobId, { code, message });
  activeEncodes.delete(jobId);
};

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
};

beforeEach(async () => {
  await installManagerWithStubs();
});

afterEach(() => {
  __resetManagerStateForTests();
});

describe('addItems + getSnapshot', () => {
  it('appends a wait item and returns its id', () => {
    const ids = addItems([
      {
        videoPath: '/v/a.mkv',
        videoName: 'a.mkv',
        subtitlePath: '/s/a.ass',
        subtitleName: 'a.ass',
        outputPath: '/out/a.mp4',
      },
    ]);
    expect(ids).toEqual(['item-1']);
    const snap = getSnapshot();
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0].status).toBe('wait');
    expect(snap.items[0].videoName).toBe('a.mkv');
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('start dispatches at the configured concurrency', () => {
  it('respects concurrency=1 — one active job at a time', async () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
      {
        videoPath: '/b',
        videoName: 'b',
        subtitlePath: '/sb',
        subtitleName: 'sb',
        outputPath: '/ob',
      },
    ]);
    start();
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(1);
    fireFinish('job-1');
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(1);
    fireFinish('job-2');
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(0);
  });

  it('respects concurrency>1 — N parallel jobs', async () => {
    setSettings({ concurrency: 3 });
    addItems(
      Array.from({ length: 4 }, (_, i) => ({
        videoPath: `/v${i}`,
        videoName: `v${i}`,
        subtitlePath: `/s${i}`,
        subtitleName: `s${i}`,
        outputPath: `/o${i}`,
      }))
    );
    start();
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(3);
  });
});

describe('soft pause', () => {
  it('halts dispatcher but lets in-flight items finish', async () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
      {
        videoPath: '/b',
        videoName: 'b',
        subtitlePath: '/sb',
        subtitleName: 'sb',
        outputPath: '/ob',
      },
    ]);
    start();
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(1);
    pause();
    expect(activeEncodes.size).toBe(1); // not cancelled
    fireFinish('job-1');
    await flushMicrotasks();
    // No new dispatch while paused.
    expect(activeEncodes.size).toBe(0);
    expect(getSnapshot().items[1].status).toBe('wait');
    resume();
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(1);
  });
});

describe('retry policy', () => {
  it('retries up to maxRetries with exponential backoff, then errors out', async () => {
    setSettings({ maxRetries: 2, backoffMs: 100 });
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    start();
    await flushMicrotasks();
    fireFail('job-1');
    await flushMicrotasks();
    let item = getSnapshot().items[0];
    expect(item.status).toBe('wait');
    expect(item.attempts).toBe(1);
    expect(scheduledRetries).toHaveLength(1);
    expect(scheduledRetries[0].ms).toBe(100); // 100 * 2^0
    // Trigger the retry tick.
    scheduledRetries[0].fn();
    await flushMicrotasks();
    fireFail('job-2');
    await flushMicrotasks();
    item = getSnapshot().items[0];
    expect(item.attempts).toBe(2);
    expect(scheduledRetries).toHaveLength(2);
    expect(scheduledRetries[1].ms).toBe(200); // 100 * 2^1
    scheduledRetries[1].fn();
    await flushMicrotasks();
    fireFail('job-3');
    await flushMicrotasks();
    item = getSnapshot().items[0];
    expect(item.status).toBe('error');
    expect(item.attempts).toBe(2); // no further retry
  });

  it('does not retry a cancelled item', async () => {
    setSettings({ maxRetries: 5, backoffMs: 100 });
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    start();
    await flushMicrotasks();
    cancelItem('item-1');
    await flushMicrotasks();
    expect(getSnapshot().items[0].status).toBe('cancelled');
    expect(scheduledRetries).toHaveLength(0);
  });
});

describe('reorderItem', () => {
  it('moves an item from one index to another', () => {
    addItems(
      Array.from({ length: 4 }, (_, i) => ({
        videoPath: `/v${i}`,
        videoName: `v${i}`,
        subtitlePath: `/s${i}`,
        subtitleName: `s${i}`,
        outputPath: `/o${i}`,
      }))
    );
    reorderItem(3, 0);
    const ids = getSnapshot().items.map(i => i.id);
    expect(ids).toEqual(['item-4', 'item-1', 'item-2', 'item-3']);
  });

  it('clamps invalid indexes (no-op)', () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    reorderItem(0, 99);
    expect(getSnapshot().items).toHaveLength(1);
  });
});

describe('removeItem', () => {
  it('removes a wait item', () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    expect(removeItem('item-1')).toBe(true);
    expect(getSnapshot().items).toHaveLength(0);
  });

  it('cancels and removes an active item', async () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    start();
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(1);
    expect(removeItem('item-1')).toBe(true);
    expect(getSnapshot().items).toHaveLength(0);
    expect(activeEncodes.size).toBe(0);
  });
});

describe('clearDone', () => {
  it('strips done items, preserves errors / wait', async () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
      {
        videoPath: '/b',
        videoName: 'b',
        subtitlePath: '/sb',
        subtitleName: 'sb',
        outputPath: '/ob',
      },
    ]);
    start();
    await flushMicrotasks();
    fireFinish('job-1');
    await flushMicrotasks();
    fireFail('job-2');
    await flushMicrotasks();
    // item-1 → done, item-2 → error (after retries exhausted = 0 + maxRetries=2).
    // Trigger any scheduled retries.
    while (scheduledRetries.length > 0) {
      const next = scheduledRetries.shift()!;
      next.fn();
      await flushMicrotasks();
      // every retry will fail again
      const stillActive = [...activeEncodes.keys()];
      for (const jobId of stillActive) fireFail(jobId);
      await flushMicrotasks();
    }
    expect(getSnapshot().items.find(i => i.id === 'item-1')?.status).toBe('done');
    expect(getSnapshot().items.find(i => i.id === 'item-2')?.status).toBe('error');
    clearDone();
    const remaining = getSnapshot().items;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe('error');
  });
});

describe('retryItem', () => {
  it('resets an error item back to wait with attempts=0', async () => {
    setSettings({ maxRetries: 0 });
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    start();
    await flushMicrotasks();
    fireFail('job-1');
    await flushMicrotasks();
    expect(getSnapshot().items[0].status).toBe('error');
    expect(retryItem('item-1')).toBe(true);
    const item = getSnapshot().items[0];
    expect(item.status).toBe('wait');
    expect(item.attempts).toBe(0);
    expect(item.lastError).toBeNull();
  });
});

describe('hydrate from snapshot', () => {
  it('demotes active items to wait + sweeps source-missing items to error', async () => {
    await installManagerWithStubs(new Set(['/exists.mkv', '/exists.ass']), {
      version: 1,
      savedAt: 0,
      settings: { concurrency: 1, maxRetries: 2, backoffMs: 4000, encoding: {} },
      items: [
        // Existing source — survives sweep.
        {
          id: 'survives',
          videoPath: '/exists.mkv',
          videoName: 'exists.mkv',
          subtitlePath: '/exists.ass',
          subtitleName: 'exists.ass',
          outputPath: '/o.mp4',
          status: 'wait',
          progress: null,
          attempts: 0,
          lastError: null,
          addedAt: 1,
          startedAt: null,
          completedAt: null,
          logs: [],
        },
        // Missing source — sweep flips to error.
        {
          id: 'missing',
          videoPath: '/gone.mkv',
          videoName: 'gone.mkv',
          subtitlePath: '/gone.ass',
          subtitleName: 'gone.ass',
          outputPath: '/o.mp4',
          status: 'wait',
          progress: null,
          attempts: 0,
          lastError: null,
          addedAt: 1,
          startedAt: null,
          completedAt: null,
          logs: [],
        },
      ],
      running: false,
      paused: false,
    });
    const snap = getSnapshot();
    expect(snap.items.find(i => i.id === 'survives')?.status).toBe('wait');
    const missing = snap.items.find(i => i.id === 'missing');
    expect(missing?.status).toBe('error');
    expect(missing?.lastError).toBe('Source file missing');
  });
});

describe('queue-complete event', () => {
  it('fires once when the dispatcher drains with at least one done item', async () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
      {
        videoPath: '/b',
        videoName: 'b',
        subtitlePath: '/sb',
        subtitleName: 'sb',
        outputPath: '/ob',
      },
    ]);
    start();
    await flushMicrotasks();
    fireFinish('job-1');
    await flushMicrotasks();
    fireFinish('job-2');
    await flushMicrotasks();
    expect(onQueueComplete).toHaveBeenCalledTimes(1);
    expect(onQueueComplete).toHaveBeenCalledWith(2);
  });

  it('does not fire when every item ends in error/cancelled (no done count)', async () => {
    setSettings({ maxRetries: 0 });
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    start();
    await flushMicrotasks();
    fireFail('job-1');
    await flushMicrotasks();
    expect(onQueueComplete).not.toHaveBeenCalled();
  });
});

describe('cancelAll waits for items to drain', () => {
  it('returns once every active job has settled', async () => {
    addItems([
      {
        videoPath: '/a',
        videoName: 'a',
        subtitlePath: '/sa',
        subtitleName: 'sa',
        outputPath: '/oa',
      },
    ]);
    start();
    await flushMicrotasks();
    expect(activeEncodes.size).toBe(1);
    await cancelAll();
    expect(activeEncodes.size).toBe(0);
    expect(getSnapshot().running).toBe(false);
  });
});
