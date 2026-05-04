import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture handle calls — `with-ipc-handler.handle` is what the queue
// handlers register through. Stubbing it lets us drive each registered
// channel synchronously without bringing up `ipcMain`.
const registered = new Map<string, (...args: unknown[]) => unknown>();
const safeSendCalls: Array<{ channel: string; payload: unknown }> = [];

vi.mock('electron', () => ({
  ipcMain: { removeHandler: vi.fn() },
  Notification: class {
    title?: string;
    body?: string;
    static isSupported = vi.fn(() => true);
    constructor(opts: { title: string; body: string }) {
      this.title = opts.title;
      this.body = opts.body;
      shownNotifications.push(opts);
    }
    show = vi.fn();
  },
}));

const shownNotifications: Array<{ title: string; body: string }> = [];

vi.mock('../with-ipc-handler', () => ({
  handle: (channel: string, schema: unknown, fn: (...args: unknown[]) => unknown) => {
    void schema;
    registered.set(channel, fn);
  },
}));

vi.mock('../../logger', () => ({
  createMainLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }),
}));

const getSettingMock = vi.fn();
vi.mock('../../store', () => ({
  getSetting: (key: string) => getSettingMock(key),
}));

import { IPC_CHANNELS, QUEUE_EVENT_CHANNELS } from '@moekoder/shared';
import {
  __resetManagerStateForTests,
  __setManagerDepsForTests,
  initQueueManager,
  getSnapshot,
} from '../../queue/manager';
import { buildQueueManagerEvents, cleanupQueueHandlers, registerQueueHandlers } from './queue';
import type { IpcContext } from '../register';

const makeMainWindow = () => ({
  isDestroyed: vi.fn(() => false),
  webContents: {
    send: vi.fn((channel: string, payload: unknown) => {
      safeSendCalls.push({ channel, payload });
    }),
  },
});

const makeCtx = (): IpcContext => {
  const win = makeMainWindow();
  return { mainWindow: win as unknown as IpcContext['mainWindow'] };
};

beforeEach(() => {
  registered.clear();
  safeSendCalls.length = 0;
  shownNotifications.length = 0;
  getSettingMock.mockReset();
  __resetManagerStateForTests();
});

afterEach(() => {
  cleanupQueueHandlers();
});

describe('queue handlers — registration', () => {
  it('registers all queue:* channels', () => {
    registerQueueHandlers(makeCtx());
    const expected = [
      IPC_CHANNELS.QUEUE_GET_SNAPSHOT,
      IPC_CHANNELS.QUEUE_ADD_ITEMS,
      IPC_CHANNELS.QUEUE_REMOVE_ITEM,
      IPC_CHANNELS.QUEUE_REORDER,
      IPC_CHANNELS.QUEUE_UPDATE_OUTPUT,
      IPC_CHANNELS.QUEUE_START,
      IPC_CHANNELS.QUEUE_PAUSE,
      IPC_CHANNELS.QUEUE_RESUME,
      IPC_CHANNELS.QUEUE_CLEAR_DONE,
      IPC_CHANNELS.QUEUE_CANCEL_ITEM,
      IPC_CHANNELS.QUEUE_RETRY_ITEM,
      IPC_CHANNELS.QUEUE_SET_SETTINGS,
    ];
    for (const channel of expected) {
      expect(registered.has(channel)).toBe(true);
    }
  });

  it('queue:get-snapshot delegates to manager.getSnapshot', async () => {
    await initQueueManager({}, { snapshot: null });
    registerQueueHandlers(makeCtx());
    const handler = registered.get(IPC_CHANNELS.QUEUE_GET_SNAPSHOT)!;
    const result = await handler({});
    const expected = getSnapshot();
    expect((result as typeof expected).items).toEqual(expected.items);
    expect((result as typeof expected).version).toEqual(expected.version);
  });

  it('queue:add-items forwards through to manager.addItems', async () => {
    let nextId = 0;
    __setManagerDepsForTests({ newItemId: () => `id-${++nextId}`, scheduleFlush: () => {} });
    await initQueueManager({}, { snapshot: null }, { newItemId: () => `id-${++nextId}` });
    registerQueueHandlers(makeCtx());
    const handler = registered.get(IPC_CHANNELS.QUEUE_ADD_ITEMS)!;
    const ids = await handler({}, [
      {
        videoPath: '/v.mkv',
        videoName: 'v.mkv',
        subtitlePath: '/s.ass',
        subtitleName: 's.ass',
        outputPath: '/o.mp4',
      },
    ]);
    expect(Array.isArray(ids)).toBe(true);
    expect((ids as string[])[0]).toMatch(/^id-/);
  });
});

describe('queue handlers — manager event sink', () => {
  it('forwards onChanged to the queue:changed channel via safeSend', () => {
    const events = buildQueueManagerEvents(makeCtx());
    const snapshot = getSnapshot();
    events.onChanged?.(snapshot);
    // The mainWindow we built isn't shared across builds; safeSendCalls
    // is fed by the most recently constructed window. Build a *single*
    // ctx and re-test.
    safeSendCalls.length = 0;
    const ctx = makeCtx();
    const evs2 = buildQueueManagerEvents(ctx);
    evs2.onChanged?.(snapshot);
    expect(safeSendCalls).toHaveLength(1);
    expect(safeSendCalls[0].channel).toBe(QUEUE_EVENT_CHANNELS.CHANGED);
  });

  it('skips safeSend when window is destroyed', () => {
    const ctx = makeCtx();
    (ctx.mainWindow.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const events = buildQueueManagerEvents(ctx);
    events.onChanged?.(getSnapshot());
    events.onItemProgress?.('id-x', {
      pct: 1,
      fps: 1,
      bitrateKbps: 1,
      speed: 1,
      outTimeSec: 1,
      etaSec: 1,
    });
    events.onItemLog?.('id-x', { ts: 1, level: 'info', text: 'hi' });
    expect(safeSendCalls).toHaveLength(0);
  });

  it('forwards per-item progress + log on dedicated channels', () => {
    const ctx = makeCtx();
    const events = buildQueueManagerEvents(ctx);
    events.onItemProgress?.('id-x', {
      pct: 50,
      fps: 60,
      bitrateKbps: 2000,
      speed: 1.5,
      outTimeSec: 30,
      etaSec: 30,
    });
    events.onItemLog?.('id-x', { ts: 1, level: 'info', text: 'hi' });
    const channels = safeSendCalls.map(c => c.channel);
    expect(channels).toContain(QUEUE_EVENT_CHANNELS.ITEM_PROGRESS);
    expect(channels).toContain(QUEUE_EVENT_CHANNELS.ITEM_LOG);
  });

  it('honours queueNotifyOnComplete = false (no notification)', () => {
    getSettingMock.mockReturnValueOnce(false);
    const ctx = makeCtx();
    const events = buildQueueManagerEvents(ctx);
    events.onQueueComplete?.(3);
    expect(shownNotifications).toHaveLength(0);
  });

  it('fires notification when queueNotifyOnComplete = true', () => {
    getSettingMock.mockReturnValueOnce(true);
    const ctx = makeCtx();
    const events = buildQueueManagerEvents(ctx);
    events.onQueueComplete?.(3);
    expect(shownNotifications).toHaveLength(1);
    expect(shownNotifications[0].title).toBe('Queue complete');
    expect(shownNotifications[0].body).toContain('3');
  });
});
