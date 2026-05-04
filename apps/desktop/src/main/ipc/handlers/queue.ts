/**
 * Queue IPC handlers — translate the renderer's `queue:*` invocations into
 * `QueueManager` calls, and forward the manager's events down the
 * one-way `queue:changed` / `queue:item:progress` / `queue:item:log`
 * channels using the same `safeSend` pattern the encode handler uses.
 *
 * The handler module owns the event-listener wiring lifecycle. Init runs
 * once after the manager is constructed; cleanup unregisters everything
 * on app quit.
 */
import { ipcMain, Notification } from 'electron';
import {
  IPC_CHANNELS,
  QUEUE_EVENT_CHANNELS,
  type NewQueueItem,
  type QueueSettings,
  type QueueSnapshot,
} from '@moekoder/shared';
import {
  addItems,
  cancelItem,
  clearDone,
  getSnapshot,
  pause,
  removeItem,
  reorderItem,
  resume,
  retryItem,
  setSettings,
  start,
  updateItemOutput,
  type QueueManagerEvents,
} from '../../queue/manager';
import { handle } from '../with-ipc-handler';
import {
  queueAddItemsSchema,
  queueCancelItemSchema,
  queueRemoveItemSchema,
  queueReorderSchema,
  queueRetryItemSchema,
  queueSetSettingsSchema,
  queueUpdateOutputSchema,
} from '../schemas/queue.schemas';
import { getSetting } from '../../store';
import type { IpcContext } from '../register';
import { createMainLogger } from '../../logger';

const log = createMainLogger('ipc:queue');

/**
 * Build the manager-event sink that the handler module owns. The sink is
 * passed to `initQueueManager` from the bootstrap; this factory is exported
 * so `index.ts` can wire it before handler registration.
 */
export const buildQueueManagerEvents = (ctx: IpcContext): QueueManagerEvents => {
  const { mainWindow } = ctx;
  const safeSend = (channel: string, payload: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  return {
    onChanged: snapshot => safeSend(QUEUE_EVENT_CHANNELS.CHANGED, snapshot),
    onItemProgress: (itemId, progress) =>
      safeSend(QUEUE_EVENT_CHANNELS.ITEM_PROGRESS, { itemId, progress }),
    onItemLog: (itemId, line) => safeSend(QUEUE_EVENT_CHANNELS.ITEM_LOG, { itemId, line }),
    onQueueComplete: doneCount => {
      // Honor the user's notification opt-out. `getSetting` is sync.
      const enabled = getSetting('queueNotifyOnComplete');
      if (!enabled) return;
      try {
        if (Notification.isSupported()) {
          new Notification({
            title: 'Queue complete',
            body: `${doneCount} file${doneCount === 1 ? '' : 's'} done.`,
          }).show();
        }
      } catch (err) {
        log.warn('Failed to show queue-complete notification:', err);
      }
    },
  };
};

export function registerQueueHandlers(_ctx: IpcContext): void {
  handle<[], QueueSnapshot>(IPC_CHANNELS.QUEUE_GET_SNAPSHOT, undefined, () => getSnapshot());

  handle<[NewQueueItem[]], string[]>(
    IPC_CHANNELS.QUEUE_ADD_ITEMS,
    queueAddItemsSchema,
    (_event, items) => addItems(items)
  );

  handle<[string], boolean>(IPC_CHANNELS.QUEUE_REMOVE_ITEM, queueRemoveItemSchema, (_event, id) =>
    removeItem(id)
  );

  handle<[number, number], void>(
    IPC_CHANNELS.QUEUE_REORDER,
    queueReorderSchema,
    (_event, from, to) => reorderItem(from, to)
  );

  handle<[string, string], boolean>(
    IPC_CHANNELS.QUEUE_UPDATE_OUTPUT,
    queueUpdateOutputSchema,
    (_event, id, newOutputPath) => updateItemOutput(id, newOutputPath)
  );

  handle<[], void>(IPC_CHANNELS.QUEUE_START, undefined, () => start());
  handle<[], void>(IPC_CHANNELS.QUEUE_PAUSE, undefined, () => pause());
  handle<[], void>(IPC_CHANNELS.QUEUE_RESUME, undefined, () => resume());
  handle<[], void>(IPC_CHANNELS.QUEUE_CLEAR_DONE, undefined, () => clearDone());

  handle<[string], boolean>(IPC_CHANNELS.QUEUE_CANCEL_ITEM, queueCancelItemSchema, (_event, id) =>
    cancelItem(id)
  );

  handle<[string], boolean>(IPC_CHANNELS.QUEUE_RETRY_ITEM, queueRetryItemSchema, (_event, id) =>
    retryItem(id)
  );

  handle<[Partial<QueueSettings>], QueueSettings>(
    IPC_CHANNELS.QUEUE_SET_SETTINGS,
    queueSetSettingsSchema,
    (_event, partial) => setSettings(partial as Partial<QueueSettings>)
  );
}

export function cleanupQueueHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_GET_SNAPSHOT);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_ADD_ITEMS);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_REMOVE_ITEM);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_REORDER);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_UPDATE_OUTPUT);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_START);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_PAUSE);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_RESUME);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_CLEAR_DONE);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_CANCEL_ITEM);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_RETRY_ITEM);
  ipcMain.removeHandler(IPC_CHANNELS.QUEUE_SET_SETTINGS);
}
