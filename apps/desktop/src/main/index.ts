import { app, BrowserWindow, session } from 'electron';
import * as os from 'node:os';
import { APP_NAME } from '@moekoder/shared';
import { log, cleanupOldLogs } from './logger';
import { createMainWindow } from './window';
import { applyCsp } from './security/apply-csp';
import { registerAllIpcHandlers, cleanupAllIpcHandlers } from './ipc/register';
import { initUpdater } from './updater';

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
      try {
        cleanupAllIpcHandlers();
      } catch (err) {
        log.warn('Failed to cleanup IPC handlers:', err);
      }
      // TODO(phase-2b): await ffmpeg process termination here.
      // TODO(phase-3): await encode worker drain + flushLogs here.
    })().finally(() => {
      cleanupDone = true;
      app.quit();
    });
  });
}
