import { ipcMain } from 'electron';
import { FFMPEG_EVENT_CHANNELS, IPC_CHANNELS } from '@moekoder/shared';
import {
  ensureInstalled,
  getInstalledVersion,
  isInstalled,
  removeInstalled,
  type InstallProgress,
} from '../../ffmpeg/manager';
import { probe, type ProbeResult } from '../../ffmpeg/probe';
import { handle } from '../with-ipc-handler';
import {
  ffmpegEnsureBinariesSchema,
  ffmpegGetVersionSchema,
  ffmpegIsInstalledSchema,
  ffmpegProbeSchema,
  ffmpegRemoveInstalledSchema,
} from '../schemas/ffmpeg.schemas';
import type { IpcContext } from '../register';

export function registerFfmpegHandlers(ctx: IpcContext): void {
  const { mainWindow } = ctx;

  handle<[], boolean>(IPC_CHANNELS.FFMPEG_IS_INSTALLED, ffmpegIsInstalledSchema, () =>
    isInstalled()
  );

  handle<[], string | null>(IPC_CHANNELS.FFMPEG_GET_VERSION, ffmpegGetVersionSchema, () =>
    getInstalledVersion()
  );

  handle<[], void>(IPC_CHANNELS.FFMPEG_ENSURE_BINARIES, ffmpegEnsureBinariesSchema, async () => {
    await ensureInstalled((payload: InstallProgress) => {
      // `webContents.send` is safe to call even if the renderer isn't
      // listening — events buffer until a listener attaches. Skip when
      // the window is gone so we don't throw inside progress callbacks.
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(FFMPEG_EVENT_CHANNELS.DOWNLOAD_PROGRESS, payload);
      }
    });
  });

  handle<[string], ProbeResult>(IPC_CHANNELS.FFMPEG_PROBE, ffmpegProbeSchema, (_event, filePath) =>
    probe(filePath)
  );

  handle<[], void>(IPC_CHANNELS.FFMPEG_REMOVE_INSTALLED, ffmpegRemoveInstalledSchema, async () => {
    await removeInstalled();
  });
}

export function cleanupFfmpegHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_IS_INSTALLED);
  ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_GET_VERSION);
  ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_ENSURE_BINARIES);
  ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_PROBE);
  ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_REMOVE_INSTALLED);
}
