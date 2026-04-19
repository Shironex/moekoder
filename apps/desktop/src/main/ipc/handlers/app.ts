import { app, ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '@moekoder/shared';
import { IpcError } from '../errors';
import { handle } from '../with-ipc-handler';
import { appVersionSchema, appOpenExternalSchema } from '../schemas/app.schemas';
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
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.APP_VERSION);
  ipcMain.removeHandler(IPC_CHANNELS.APP_OPEN_EXTERNAL);
}
