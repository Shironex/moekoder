import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@moekoder/shared';
import { checkForUpdates, downloadUpdate, quitAndInstall } from '../../updater';
import { handle } from '../with-ipc-handler';
import {
  updaterCheckSchema,
  updaterDownloadSchema,
  updaterInstallSchema,
} from '../schemas/updater.schemas';
import type { IpcContext } from '../register';

export function registerUpdaterHandlers(_ctx: IpcContext): void {
  handle<[], void>(IPC_CHANNELS.UPDATER_CHECK, updaterCheckSchema, async () => {
    await checkForUpdates();
  });

  handle<[], void>(IPC_CHANNELS.UPDATER_DOWNLOAD, updaterDownloadSchema, async () => {
    await downloadUpdate();
  });

  handle<[], void>(IPC_CHANNELS.UPDATER_INSTALL, updaterInstallSchema, () => {
    quitAndInstall();
  });
}

export function cleanupUpdaterHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.UPDATER_CHECK);
  ipcMain.removeHandler(IPC_CHANNELS.UPDATER_DOWNLOAD);
  ipcMain.removeHandler(IPC_CHANNELS.UPDATER_INSTALL);
}
