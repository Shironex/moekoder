import { ipcMain } from 'electron';
import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { IPC_CHANNELS } from '@moekoder/shared';
import { handle } from '../with-ipc-handler';
import { fsListFolderSchema } from '../schemas/fs.schemas';
import type { IpcContext } from '../register';

interface FsListFolderInput {
  folderPath: string;
  videoExtensions: string[];
  subtitleExtensions: string[];
}

interface FsListFolderResult {
  videos: string[];
  subtitles: string[];
}

/**
 * Lowercase, leading-dot-normalised extension lookup. Builds a `Set` so the
 * per-entry classification stays O(1) even with the eight-extension whitelist.
 */
function buildExtSet(exts: string[]): Set<string> {
  const out = new Set<string>();
  for (const ext of exts) {
    if (!ext) continue;
    const lower = ext.toLowerCase();
    out.add(lower.startsWith('.') ? lower : `.${lower}`);
  }
  return out;
}

export function registerFsHandlers(_ctx: IpcContext): void {
  handle<[FsListFolderInput], FsListFolderResult>(
    IPC_CHANNELS.FS_LIST_FOLDER,
    fsListFolderSchema,
    async (_event, input) => {
      const videoExts = buildExtSet(input.videoExtensions);
      const subExts = buildExtSet(input.subtitleExtensions);

      let entries: Dirent[];
      try {
        entries = (await fs.readdir(input.folderPath, { withFileTypes: true })) as Dirent[];
      } catch {
        return { videos: [], subtitles: [] };
      }

      const videos: string[] = [];
      const subtitles: string[] = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!ext) continue;
        const full = path.join(input.folderPath, entry.name);
        if (videoExts.has(ext)) videos.push(full);
        else if (subExts.has(ext)) subtitles.push(full);
      }

      // Numeric-aware sort so `ep2.mkv` comes before `ep10.mkv` in the
      // candidates dropdown — the default lexicographic order would put
      // `ep10` first and feel broken on episode lists.
      videos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      subtitles.sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );

      return { videos, subtitles };
    }
  );
}

export function cleanupFsHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.FS_LIST_FOLDER);
}
