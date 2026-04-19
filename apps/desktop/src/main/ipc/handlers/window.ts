import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@moekoder/shared';
import { handle } from '../with-ipc-handler';
import {
  windowCloseSchema,
  windowMaximizeSchema,
  windowMinimizeSchema,
} from '../schemas/window.schemas';
import type { IpcContext } from '../register';

/**
 * Resolves the window the user is currently interacting with. Falls back to
 * the main window if nothing is focused (e.g. the renderer triggered this
 * during a brief focus-lost moment).
 */
function resolveTargetWindow(ctx: IpcContext): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  if (!ctx.mainWindow.isDestroyed()) return ctx.mainWindow;
  return null;
}

export function registerWindowHandlers(ctx: IpcContext): void {
  handle<[], void>(IPC_CHANNELS.WINDOW_MINIMIZE, windowMinimizeSchema, () => {
    resolveTargetWindow(ctx)?.minimize();
  });

  handle<[], void>(IPC_CHANNELS.WINDOW_MAXIMIZE, windowMaximizeSchema, () => {
    const win = resolveTargetWindow(ctx);
    if (!win) return;
    // Toggle — clicking maximize on a maximized window should restore it,
    // matching OS-native titlebar behaviour on Windows / macOS.
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  handle<[], void>(IPC_CHANNELS.WINDOW_CLOSE, windowCloseSchema, () => {
    resolveTargetWindow(ctx)?.close();
  });
}

export function cleanupWindowHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MINIMIZE);
  ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MAXIMIZE);
  ipcMain.removeHandler(IPC_CHANNELS.WINDOW_CLOSE);
}
