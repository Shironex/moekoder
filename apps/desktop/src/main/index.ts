import { app, BrowserWindow, session } from 'electron';
import * as os from 'node:os';
import { APP_NAME } from '@moekoder/shared';
import { log, cleanupOldLogs } from './logger';
import { createMainWindow } from './window';
import { applyCsp } from './security/apply-csp';
import { registerAllIpcHandlers, cleanupAllIpcHandlers } from './ipc/register';
import { cancelAllEncodes } from './encode/orchestrator';
import { initUpdater } from './updater';
import {
  initQueueManager,
  cancelAll as cancelAllQueueItems,
  getSnapshot as getQueueSnapshot,
} from './queue/manager';
import { loadSnapshot, scheduleFlush, flushNow } from './queue/persistence';
import { buildQueueManagerEvents } from './ipc/handlers/queue';
import { getSetting } from './store';

let mainWindow: BrowserWindow | null = null;
let cleanupDone = false;
let shuttingDown = false;

// Single-instance lock: reuse the existing window when a second launch fires.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  process.on('uncaughtException', err => {
    log.error('Uncaught exception:', err);
  });
  process.on('unhandledRejection', reason => {
    log.error('Unhandled rejection:', reason);
  });

  app
    .whenReady()
    .then(async () => {
      app.setName(APP_NAME);

      log.info('='.repeat(60));
      log.info(`New session — ${APP_NAME} v${app.getVersion()}`);
      log.info(`[system] OS: ${os.platform()} ${os.release()} (${os.arch()})`);
      log.info(
        `[system] Electron: ${process.versions.electron}, Chrome: ${process.versions.chrome}, Node: ${process.versions.node}`
      );
      log.info(`[system] userData: ${app.getPath('userData')}`);
      log.info(`[security] App packaged: ${app.isPackaged}`);
      log.info('='.repeat(60));

      cleanupOldLogs();

      applyCsp(session.defaultSession);

      mainWindow = createMainWindow();

      // Hydrate queue state BEFORE registering IPC handlers so the renderer's
      // first `queue:get-snapshot` call returns the post-recovery view, not
      // an empty queue.
      try {
        const snapshot = await loadSnapshot();
        const queueEvents = buildQueueManagerEvents({ mainWindow });
        await initQueueManager(
          queueEvents,
          {
            snapshot,
            settings: {
              concurrency: getSetting('queueConcurrency'),
              maxRetries: getSetting('queueMaxRetries'),
              backoffMs: getSetting('queueBackoffMs'),
            },
            // Wire the persistence flush into the manager's emitChange path.
            // Inlined here to avoid a circular require between manager and
            // persistence (manager imports the type, not the impl).
          },
          {
            scheduleFlush: provider => scheduleFlush(provider),
          }
        );
      } catch (err) {
        log.warn('Failed to initialize queue manager:', err);
      }

      registerAllIpcHandlers({ mainWindow });

      try {
        initUpdater(mainWindow);
      } catch (err) {
        log.warn('Failed to initialize auto-updater:', err);
      }

      log.info(`${APP_NAME} ready`);
    })
    .catch(err => {
      log.error('Failed to bootstrap application:', err);
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      registerAllIpcHandlers({ mainWindow });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  /**
   * Graceful shutdown. `before-quit` fires once for the first quit request;
   * we preventDefault until async cleanup finishes, then call `app.quit()`
   * again with `cleanupDone` set so we fall through. Subsequent phases hook
   * additional resources (ffmpeg, workers) into the async block below.
   */
  app.on('before-quit', event => {
    mainWindow = null;

    if (cleanupDone) return;
    event.preventDefault();
    if (shuttingDown) return;
    shuttingDown = true;

    void (async () => {
      // Snapshot the queue FIRST so the on-disk state captures whatever was
      // running pre-quit. Items that were `active` will be demoted to `wait`
      // on next boot via the persistence layer's sanitizeOnLoad — but only
      // if they're persisted from this snapshot before SIGTERM lands.
      try {
        await flushNow(getQueueSnapshot);
      } catch (err) {
        log.warn('Failed to flush queue snapshot before quit:', err);
      }
      // Now drain queue items + Single-route encodes. cancelAllQueueItems
      // is a superset that resolves once every queue child has settled;
      // cancelAllEncodes catches anything left (Single-route).
      try {
        await cancelAllQueueItems();
      } catch (err) {
        log.warn('Failed to drain queue items:', err);
      }
      try {
        await cancelAllEncodes();
      } catch (err) {
        log.warn('Failed to drain active encodes:', err);
      }
      // Final flush — the cancellation cascade may have updated item states
      // (active → cancelled) that the first flush missed.
      try {
        await flushNow(getQueueSnapshot);
      } catch (err) {
        log.warn('Failed final queue flush:', err);
      }
      try {
        cleanupAllIpcHandlers();
      } catch (err) {
        log.warn('Failed to cleanup IPC handlers:', err);
      }
    })().finally(() => {
      cleanupDone = true;
      app.quit();
    });
  });
}
