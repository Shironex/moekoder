import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@moekoder/shared';
import { handle } from '../with-ipc-handler';
import {
  dialogOpenFileSchema,
  dialogOpenFilesSchema,
  dialogOpenFolderSchema,
  dialogSaveFileSchema,
} from '../schemas/dialog.schemas';
import type { IpcContext } from '../register';

/**
 * Input shape for `dialog:open-file` / `dialog:save-file`. `filters` is the
 * raw `Electron.FileFilter[]` the OS dialog expects. `defaultPath` pre-seeds
 * the initial location — handy for remembering the user's last choice.
 */
interface DialogFileInput {
  filters: Electron.FileFilter[];
  defaultPath?: string;
}

interface DialogOpenFolderInput {
  defaultPath?: string;
}

interface DialogOpenFileResult {
  canceled: boolean;
  filePath: string | null;
}

interface DialogOpenFilesResult {
  canceled: boolean;
  filePaths: string[];
}

interface DialogSaveFileResult {
  canceled: boolean;
  filePath: string | null;
}

interface DialogOpenFolderResult {
  canceled: boolean;
  folderPath: string | null;
}

/**
 * Scopes a dialog to the focused window when possible so it reads as modal
 * to the user. Falls back to an unparented dialog if nothing is focused
 * (e.g. the window was closed while the dialog was opening).
 */
function getFocusedOrMain(ctx: IpcContext): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  if (!ctx.mainWindow.isDestroyed()) return ctx.mainWindow;
  return null;
}

export function registerDialogHandlers(ctx: IpcContext): void {
  handle<[DialogFileInput], DialogOpenFileResult>(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    dialogOpenFileSchema,
    async (_event, input) => {
      const parent = getFocusedOrMain(ctx);
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            properties: ['openFile'],
            filters: input.filters,
            defaultPath: input.defaultPath,
          })
        : await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: input.filters,
            defaultPath: input.defaultPath,
          });

      const [filePath] = result.filePaths;
      return {
        canceled: result.canceled,
        filePath: result.canceled || !filePath ? null : filePath,
      };
    }
  );

  handle<[DialogFileInput], DialogOpenFilesResult>(
    IPC_CHANNELS.DIALOG_OPEN_FILES,
    dialogOpenFilesSchema,
    async (_event, input) => {
      const parent = getFocusedOrMain(ctx);
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            properties: ['openFile', 'multiSelections'],
            filters: input.filters,
            defaultPath: input.defaultPath,
          })
        : await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
            filters: input.filters,
            defaultPath: input.defaultPath,
          });

      return {
        canceled: result.canceled,
        filePaths: result.canceled ? [] : result.filePaths,
      };
    }
  );

  handle<[DialogFileInput], DialogSaveFileResult>(
    IPC_CHANNELS.DIALOG_SAVE_FILE,
    dialogSaveFileSchema,
    async (_event, input) => {
      const parent = getFocusedOrMain(ctx);
      const result = parent
        ? await dialog.showSaveDialog(parent, {
            filters: input.filters,
            defaultPath: input.defaultPath,
          })
        : await dialog.showSaveDialog({
            filters: input.filters,
            defaultPath: input.defaultPath,
          });

      return {
        canceled: result.canceled,
        filePath: result.canceled || !result.filePath ? null : result.filePath,
      };
    }
  );

  handle<[DialogOpenFolderInput], DialogOpenFolderResult>(
    IPC_CHANNELS.DIALOG_OPEN_FOLDER,
    dialogOpenFolderSchema,
    async (_event, input) => {
      const parent = getFocusedOrMain(ctx);
      const result = parent
        ? await dialog.showOpenDialog(parent, {
            properties: ['openDirectory'],
            defaultPath: input.defaultPath,
          })
        : await dialog.showOpenDialog({
            properties: ['openDirectory'],
            defaultPath: input.defaultPath,
          });

      const [folderPath] = result.filePaths;
      return {
        canceled: result.canceled,
        folderPath: result.canceled || !folderPath ? null : folderPath,
      };
    }
  );
}

export function cleanupDialogHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_OPEN_FILE);
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_OPEN_FILES);
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_SAVE_FILE);
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_OPEN_FOLDER);
}
