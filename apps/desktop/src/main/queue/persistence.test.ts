import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { QUEUE_SNAPSHOT_VERSION, type QueueSnapshot } from '@moekoder/shared';

// Stub electron's `app.getPath` so the persistence layer can resolve a
// userData path inside our temp dir. The persistence module calls
// `app.getPath('userData')` lazily so we can swap in a real temp dir.
const mockGetPath = vi.fn();
vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => mockGetPath(key),
  },
}));

// Logger imports `electron.app` indirectly — make sure that path works.
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
  __resetFlushStateForTests,
  flushNow,
  getQueuePath,
  loadSnapshot,
  saveSnapshot,
  scheduleFlush,
  setQueuePathOverride,
} from './persistence';

let tmpDir: string;

const makeSnapshot = (overrides: Partial<QueueSnapshot> = {}): QueueSnapshot => ({
  version: QUEUE_SNAPSHOT_VERSION,
  savedAt: 1_000_000,
  settings: {
    concurrency: 1,
    maxRetries: 2,
    backoffMs: 4000,
    encoding: {},
  },
  items: [],
  running: false,
  paused: false,
  ...overrides,
});

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'moekoder-queue-test-'));
  mockGetPath.mockReset();
  setQueuePathOverride(path.join(tmpDir, 'queue.json'));
  __resetFlushStateForTests();
});

afterEach(() => {
  setQueuePathOverride(null);
  __resetFlushStateForTests();
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('queue persistence — atomic write', () => {
  it('leaves no .tmp behind after a successful save', async () => {
    const filePath = getQueuePath();
    const tmpPath = `${filePath}.tmp`;

    await saveSnapshot(makeSnapshot({ items: [] }));

    // The temp file should not linger after a successful write.
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(tmpPath)).toBe(false);
    // Round-trip through readFile so we know the rename produced a parseable file.
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf-8')) as QueueSnapshot;
    expect(parsed.version).toBe(QUEUE_SNAPSHOT_VERSION);
  });

  it('serializes progress as null and logs as []', async () => {
    const item = {
      id: 'item-1',
      videoPath: '/v/a.mkv',
      videoName: 'a.mkv',
      subtitlePath: '/s/a.ass',
      subtitleName: 'a.ass',
      outputPath: '/out/a.mp4',
      status: 'wait' as const,
      progress: { pct: 42, fps: 60, bitrateKbps: 2000, speed: 1.5, outTimeSec: 30, etaSec: 30 },
      attempts: 0,
      lastError: null,
      addedAt: 1,
      startedAt: null,
      completedAt: null,
      logs: [{ ts: 1, level: 'info' as const, text: 'hi' }],
    };
    await saveSnapshot(makeSnapshot({ items: [item] }));
    const raw = await fs.readFile(getQueuePath(), 'utf-8');
    const parsed = JSON.parse(raw) as QueueSnapshot;
    expect(parsed.items[0].progress).toBeNull();
    expect(parsed.items[0].logs).toEqual([]);
  });
});

describe('queue persistence — load', () => {
  it('returns null when the file is missing', async () => {
    const result = await loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null on corrupt JSON without throwing', async () => {
    await fs.writeFile(getQueuePath(), '{ not: valid', 'utf-8');
    const result = await loadSnapshot();
    expect(result).toBeNull();
  });

  it('returns null on version mismatch', async () => {
    await fs.writeFile(
      getQueuePath(),
      JSON.stringify({ ...makeSnapshot(), version: 999 }),
      'utf-8'
    );
    const result = await loadSnapshot();
    expect(result).toBeNull();
  });

  it('demotes active items to wait on hydrate (resets attempts + startedAt)', async () => {
    const snap = makeSnapshot({
      items: [
        {
          id: 'item-1',
          videoPath: '/v.mkv',
          videoName: 'v.mkv',
          subtitlePath: '/s.ass',
          subtitleName: 's.ass',
          outputPath: '/out.mp4',
          status: 'active',
          progress: null,
          attempts: 1,
          lastError: 'boom',
          addedAt: 1,
          startedAt: 100,
          completedAt: null,
          logs: [],
        },
      ],
    });
    await fs.writeFile(getQueuePath(), JSON.stringify(snap), 'utf-8');
    const loaded = await loadSnapshot();
    expect(loaded).not.toBeNull();
    expect(loaded!.items[0].status).toBe('wait');
    expect(loaded!.items[0].attempts).toBe(0);
    expect(loaded!.items[0].startedAt).toBeNull();
  });

  it('clears running and paused on hydrate (queue does not auto-resume)', async () => {
    await fs.writeFile(
      getQueuePath(),
      JSON.stringify(makeSnapshot({ running: true, paused: true })),
      'utf-8'
    );
    const loaded = await loadSnapshot();
    expect(loaded?.running).toBe(false);
    expect(loaded?.paused).toBe(false);
  });
});

describe('queue persistence — debounced flush + flushNow', () => {
  it('coalesces a burst of scheduleFlush calls into one disk write', async () => {
    let providerCalls = 0;
    const provider = (): QueueSnapshot => {
      providerCalls += 1;
      return makeSnapshot({ savedAt: Date.now(), items: [] });
    };
    scheduleFlush(provider, 50);
    scheduleFlush(provider, 50);
    scheduleFlush(provider, 50);
    // Wait for the debounce + microtask drain.
    await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    // The provider is what saveSnapshot calls — exactly one snapshot read
    // means exactly one write was kicked off, regardless of how many times
    // scheduleFlush was invoked.
    expect(providerCalls).toBe(1);
  });

  it('flushNow writes synchronously and updates savedAt monotonically', async () => {
    const t0 = Date.now();
    await flushNow(() => makeSnapshot({ savedAt: t0 }));
    const raw1 = JSON.parse(await fs.readFile(getQueuePath(), 'utf-8')) as QueueSnapshot;
    await new Promise(r => setTimeout(r, 5));
    await flushNow(() => makeSnapshot({ savedAt: t0 + 1000 }));
    const raw2 = JSON.parse(await fs.readFile(getQueuePath(), 'utf-8')) as QueueSnapshot;
    expect(raw2.savedAt).toBeGreaterThanOrEqual(raw1.savedAt);
  });
});
