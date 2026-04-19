import * as path from 'node:path';
import { app, ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '@moekoder/shared';
import { IpcError } from '../errors';
import { handle } from '../with-ipc-handler';
import {
  appOpenExternalSchema,
  appOpenLogsFolderSchema,
  appRevealInFolderSchema,
  appVersionSchema,
} from '../schemas/app.schemas';
import type { IpcContext } from '../register';

/** Protocols we are willing to hand off to the OS via `shell.openExternal`. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

export function registerAppHandlers(_ctx: IpcContext): void {
  handle<[], string>(IPC_CHANNELS.APP_VERSION, appVersionSchema, () => {
    return app.getVersion();
  });

  handle<[string], void>(
    IPC_CHANNELS.APP_OPEN_EXTERNAL,
    appOpenExternalSchema,
    async (_event, url) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new IpcError('INVALID_INPUT', `Not a parseable URL: ${url}`);
      }
      if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        throw new IpcError(
          'PERMISSION_DENIED',
          `Protocol not allowed for external open: ${parsed.protocol}`
        );
      }
      await shell.openExternal(parsed.toString());
    }
  );

  handle<[string], void>(
    IPC_CHANNELS.APP_REVEAL_IN_FOLDER,
    appRevealInFolderSchema,
    (_event, filePath) => {
      // `showItemInFolder` is best-effort and silent on invalid paths; we
      // don't throw so callers don't need to guard against OS quirks.
      shell.showItemInFolder(filePath);
    }
  );

  handle<[], void>(IPC_CHANNELS.APP_OPEN_LOGS_FOLDER, appOpenLogsFolderSchema, async () => {
    // The logger writes into `<userData>/logs` (see main/logger.ts). We don't
    // pre-create the directory here — `shell.openPath` on a missing folder
    // returns a non-empty error string rather than throwing; callers can show
    // that to the user without us guessing a creation policy.
    const logsDir = path.join(app.getPath('userData'), 'logs');
    const result = await shell.openPath(logsDir);
    if (result) {
      throw new IpcError('INTERNAL', `Failed to open logs folder: ${result}`);
    }
  });
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.APP_VERSION);
  ipcMain.removeHandler(IPC_CHANNELS.APP_OPEN_EXTERNAL);
  ipcMain.removeHandler(IPC_CHANNELS.APP_REVEAL_IN_FOLDER);
  ipcMain.removeHandler(IPC_CHANNELS.APP_OPEN_LOGS_FOLDER);
}
