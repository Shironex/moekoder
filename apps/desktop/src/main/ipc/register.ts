/**
 * IPC contract
 * ----------------------------------------------------------------------------
 * - Handlers THROW on failure. No `{ success, error }` envelope.
 * - Use `IpcError(code, message, details?)` for failures that renderer needs to
 *   discriminate structurally (Electron strips prototypes across IPC).
 * - Channel naming: `namespace:action` or `namespace:entity:action`.
 * - Zod-validate every payload via a tuple schema attached to the handler.
 * - Every registered channel must also appear in the preload ALLOWED_IPC_CHANNELS
 *   set — the allow-list is built from `@moekoder/shared`'s IPC_CHANNELS, so
 *   add new channels to that record first.
 */
import type { BrowserWindow } from 'electron';
import { registerAppHandlers, cleanupAppHandlers } from './handlers/app';
import { registerStoreHandlers, cleanupStoreHandlers } from './handlers/store';
import { registerUpdaterHandlers, cleanupUpdaterHandlers } from './handlers/updater';
import { registerFfmpegHandlers, cleanupFfmpegHandlers } from './handlers/ffmpeg';
import { registerGpuHandlers, cleanupGpuHandlers } from './handlers/gpu';

export interface IpcContext {
  mainWindow: BrowserWindow;
}

export function registerAllIpcHandlers(ctx: IpcContext): void {
  registerAppHandlers(ctx);
  registerStoreHandlers(ctx);
  registerUpdaterHandlers(ctx);
  registerFfmpegHandlers(ctx);
  registerGpuHandlers(ctx);
}

export function cleanupAllIpcHandlers(): void {
  cleanupAppHandlers();
  cleanupStoreHandlers();
  cleanupUpdaterHandlers();
  cleanupFfmpegHandlers();
  cleanupGpuHandlers();
}
