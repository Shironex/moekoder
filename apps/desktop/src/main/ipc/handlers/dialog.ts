import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_CHANNELS, type DialogDirKind } from '@moekoder/shared';
import { handle } from '../with-ipc-handler';
import { getSetting, setSetting } from '../../store';
import { createMainLogger } from '../../logger';
import {
  dialogOpenFileSchema,
  dialogOpenFilesSchema,
  dialogOpenFolderSchema,
  dialogSaveFileSchema,
} from '../schemas/dialog.schemas';
import type { IpcContext } from '../register';

const log = createMainLogger('ipc:dialog');

/**
 * Input shape for `dialog:open-file` / `dialog:save-file`. `filters` is the
 * raw `Electron.FileFilter[]` the OS dialog expects. `defaultPath` pre-seeds
 * the initial location and overrides the remembered directory; `kind`
 * selects which remembered directory applies when it is omitted.
 */
interface DialogFileInput {
  filters: Electron.FileFilter[];
  defaultPath?: string;
  kind?: DialogDirKind;
}

interface DialogOpenFolderInput {
  defaultPath?: string;
  kind?: DialogDirKind;
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

/**
 * Reads the remembered directory for `kind`, discarding it if the folder no
 * longer resolves — a remembered path can point at a deleted folder or an
 * unplugged drive between sessions, and handing a dead path to Electron
 * opens the dialog somewhere arbitrary instead of falling back sensibly.
 */
function readRememberedDir(kind: DialogDirKind): string | undefined {
  const dir = getSetting('lastDialogDirs')?.[kind];
  if (!dir) return undefined;
  try {
    return fs.statSync(dir).isDirectory() ? dir : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the `defaultPath` handed to Electron. An explicit caller-supplied
 * path always wins; otherwise we reopen where the user last landed for this
 * kind. Electron 43 defaults an omitted `defaultPath` to the Downloads
 * folder rather than deferring to the OS's remembered location, so without
 * this every picker would reset to Downloads on each open.
 */
function resolveDefaultPath(kind: DialogDirKind, explicit: string | undefined): string | undefined {
  return explicit ?? readRememberedDir(kind);
}

/** Persists `dir` as the remembered directory for `kind`. */
function rememberDir(kind: DialogDirKind, dir: string): void {
  try {
    const current = getSetting('lastDialogDirs') ?? {};
    if (current[kind] === dir) return;
    setSetting('lastDialogDirs', { ...current, [kind]: dir });
  } catch (err) {
    // A failed write must not turn a successful pick into an IPC error.
    log.warn('failed to persist last dialog directory', { kind, err });
  }
}

export function registerDialogHandlers(ctx: IpcContext): void {
  handle<[DialogFileInput], DialogOpenFileResult>(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    dialogOpenFileSchema,
    async (_event, input) => {
      const kind = input.kind ?? 'video';
      const parent = getFocusedOrMain(ctx);
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: input.filters,
        defaultPath: resolveDefaultPath(kind, input.defaultPath),
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);

      const [filePath] = result.filePaths;
      if (result.canceled || !filePath) return { canceled: result.canceled, filePath: null };

      rememberDir(kind, path.dirname(filePath));
      return { canceled: false, filePath };
    }
  );

  handle<[DialogFileInput], DialogOpenFilesResult>(
    IPC_CHANNELS.DIALOG_OPEN_FILES,
    dialogOpenFilesSchema,
    async (_event, input) => {
      const kind = input.kind ?? 'video';
      const parent = getFocusedOrMain(ctx);
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile', 'multiSelections'],
        filters: input.filters,
        defaultPath: resolveDefaultPath(kind, input.defaultPath),
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);

      const [firstPath] = result.filePaths;
      if (result.canceled || !firstPath) return { canceled: result.canceled, filePaths: [] };

      rememberDir(kind, path.dirname(firstPath));
      return { canceled: false, filePaths: result.filePaths };
    }
  );

  handle<[DialogFileInput], DialogSaveFileResult>(
    IPC_CHANNELS.DIALOG_SAVE_FILE,
    dialogSaveFileSchema,
    async (_event, input) => {
      const kind = input.kind ?? 'save-file';
      const parent = getFocusedOrMain(ctx);
      const options: Electron.SaveDialogOptions = {
        filters: input.filters,
        defaultPath: resolveDefaultPath(kind, input.defaultPath),
      };
      const result = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);

      if (result.canceled || !result.filePath) return { canceled: result.canceled, filePath: null };

      rememberDir(kind, path.dirname(result.filePath));
      return { canceled: false, filePath: result.filePath };
    }
  );

  handle<[DialogOpenFolderInput], DialogOpenFolderResult>(
    IPC_CHANNELS.DIALOG_OPEN_FOLDER,
    dialogOpenFolderSchema,
    async (_event, input) => {
      const kind = input.kind ?? 'output-folder';
      const parent = getFocusedOrMain(ctx);
      const options: Electron.OpenDialogOptions = {
        properties: ['openDirectory'],
        defaultPath: resolveDefaultPath(kind, input.defaultPath),
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);

      const [folderPath] = result.filePaths;
      if (result.canceled || !folderPath) return { canceled: result.canceled, folderPath: null };

      // Remember the folder itself, not its parent — reopening the picker
      // should land inside the folder the user chose.
      rememberDir(kind, folderPath);
      return { canceled: false, folderPath };
    }
  );
}

export function cleanupDialogHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_OPEN_FILE);
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_OPEN_FILES);
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_SAVE_FILE);
  ipcMain.removeHandler(IPC_CHANNELS.DIALOG_OPEN_FOLDER);
}
