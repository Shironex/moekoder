import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { DialogDirKind, UserSettings } from '@moekoder/shared';

// Same shape as queue.test.ts: stub `with-ipc-handler.handle` so each
// registered channel is callable directly, without standing up `ipcMain`.
const registered = new Map<string, (...args: unknown[]) => unknown>();

const showOpenDialog = vi.fn();
const showSaveDialog = vi.fn();
const getFocusedWindow = vi.fn<() => unknown>(() => null);

vi.mock('electron', () => ({
  ipcMain: { removeHandler: vi.fn() },
  dialog: {
    showOpenDialog: (...args: unknown[]) => showOpenDialog(...args),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  BrowserWindow: { getFocusedWindow: () => getFocusedWindow() },
}));

vi.mock('../with-ipc-handler', () => ({
  handle: (channel: string, schema: unknown, fn: (...args: unknown[]) => unknown) => {
    void schema;
    registered.set(channel, fn);
  },
}));

vi.mock('../../logger', () => ({
  createMainLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }),
}));

let lastDialogDirs: UserSettings['lastDialogDirs'];
const setSettingMock = vi.fn((key: string, value: unknown) => {
  if (key === 'lastDialogDirs') lastDialogDirs = value as UserSettings['lastDialogDirs'];
});

vi.mock('../../store', () => ({
  getSetting: (key: string) => (key === 'lastDialogDirs' ? lastDialogDirs : undefined),
  setSetting: (key: string, value: unknown) => setSettingMock(key, value),
}));

import { IPC_CHANNELS } from '@moekoder/shared';
import { registerDialogHandlers } from './dialog';
import type { IpcContext } from '../register';

/** Real directories so the handler's staleness guard is exercised for real. */
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moekoder-dialog-'));
const mediaDir = path.join(tmpRoot, 'media');
const subsDir = path.join(tmpRoot, 'subs');
const outDir = path.join(tmpRoot, 'out');
for (const dir of [mediaDir, subsDir, outDir]) fs.mkdirSync(dir);
const goneDir = path.join(tmpRoot, 'gone');

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const makeCtx = (mainWindowDestroyed = false): IpcContext =>
  ({
    mainWindow: { isDestroyed: () => mainWindowDestroyed },
  }) as unknown as IpcContext;

const invoke = async <T>(channel: string, input: unknown): Promise<T> => {
  const fn = registered.get(channel);
  if (!fn) throw new Error('channel not registered: ' + channel);
  return (await fn({}, input)) as T;
};

/** The options object handed to Electron, regardless of the windowed branch. */
const optionsOf = (call: unknown[]): Record<string, unknown> =>
  (call.length === 2 ? call[1] : call[0]) as Record<string, unknown>;

beforeEach(() => {
  registered.clear();
  showOpenDialog.mockReset();
  showSaveDialog.mockReset();
  setSettingMock.mockClear();
  getFocusedWindow.mockReset().mockReturnValue(null);
  lastDialogDirs = {};
  registerDialogHandlers(makeCtx());
});

describe('dialog handlers — defaultPath resolution', () => {
  it('seeds the dialog with the remembered directory for the requested kind', async () => {
    lastDialogDirs = { video: mediaDir, subtitle: subsDir };
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, { filters: [], kind: 'subtitle' });

    expect(optionsOf(showOpenDialog.mock.calls[0]).defaultPath).toBe(subsDir);
  });

  it('lets an explicit defaultPath override the remembered directory', async () => {
    lastDialogDirs = { video: mediaDir };
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, {
      filters: [],
      kind: 'video',
      defaultPath: outDir,
    });

    expect(optionsOf(showOpenDialog.mock.calls[0]).defaultPath).toBe(outDir);
  });

  it('drops a remembered directory that no longer exists', async () => {
    lastDialogDirs = { video: goneDir };
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, { filters: [], kind: 'video' });

    expect(optionsOf(showOpenDialog.mock.calls[0]).defaultPath).toBeUndefined();
  });

  it('leaves defaultPath undefined when nothing has been remembered yet', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, { filters: [], kind: 'video' });

    expect(optionsOf(showOpenDialog.mock.calls[0]).defaultPath).toBeUndefined();
  });

  it.each<[string, string, DialogDirKind]>([
    ['open-file', IPC_CHANNELS.DIALOG_OPEN_FILE, 'video'],
    ['open-files', IPC_CHANNELS.DIALOG_OPEN_FILES, 'video'],
    ['open-folder', IPC_CHANNELS.DIALOG_OPEN_FOLDER, 'output-folder'],
  ])(
    'falls back to the per-channel kind for %s when none is supplied',
    async (_label, channel, kind) => {
      lastDialogDirs = { [kind]: mediaDir };
      showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await invoke(channel, { filters: [] });

      expect(optionsOf(showOpenDialog.mock.calls[0]).defaultPath).toBe(mediaDir);
    }
  );

  it('falls back to the save-file kind for save-file when none is supplied', async () => {
    lastDialogDirs = { 'save-file': outDir };
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

    await invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, { filters: [] });

    expect(optionsOf(showSaveDialog.mock.calls[0]).defaultPath).toBe(outDir);
  });

  it('passes the same options through the unparented branch', async () => {
    lastDialogDirs = { video: mediaDir };
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    registered.clear();
    registerDialogHandlers(makeCtx(true));

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, { filters: [], kind: 'video' });

    expect(showOpenDialog.mock.calls[0]).toHaveLength(1);
    expect(optionsOf(showOpenDialog.mock.calls[0]).defaultPath).toBe(mediaDir);
  });
});

describe('dialog handlers — remembering the picked directory', () => {
  it('stores the parent directory of a picked file', async () => {
    const picked = path.join(mediaDir, 'episode-01.mkv');
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [picked] });

    const res = await invoke<{ filePath: string | null }>(IPC_CHANNELS.DIALOG_OPEN_FILE, {
      filters: [],
      kind: 'video',
    });

    expect(res.filePath).toBe(picked);
    expect(setSettingMock).toHaveBeenCalledWith('lastDialogDirs', { video: mediaDir });
  });

  it('stores the parent of the first path for a multi-select pick', async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [path.join(mediaDir, 'a.mkv'), path.join(subsDir, 'a.ass')],
    });

    const res = await invoke<{ filePaths: string[] }>(IPC_CHANNELS.DIALOG_OPEN_FILES, {
      filters: [],
      kind: 'video',
    });

    expect(res.filePaths).toHaveLength(2);
    expect(setSettingMock).toHaveBeenCalledWith('lastDialogDirs', { video: mediaDir });
  });

  it('stores the parent directory of a save target', async () => {
    showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: path.join(outDir, 'burned.mp4'),
    });

    await invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, { filters: [], kind: 'save-file' });

    expect(setSettingMock).toHaveBeenCalledWith('lastDialogDirs', { 'save-file': outDir });
  });

  it('stores the chosen folder itself, not its parent', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [outDir] });

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FOLDER, { kind: 'output-folder' });

    expect(setSettingMock).toHaveBeenCalledWith('lastDialogDirs', { 'output-folder': outDir });
  });

  it('preserves the other kinds when updating one', async () => {
    lastDialogDirs = { subtitle: subsDir };
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [path.join(mediaDir, 'a.mkv')],
    });

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, { filters: [], kind: 'video' });

    expect(setSettingMock).toHaveBeenCalledWith('lastDialogDirs', {
      subtitle: subsDir,
      video: mediaDir,
    });
  });

  it('does not write when the directory is already remembered', async () => {
    lastDialogDirs = { video: mediaDir };
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [path.join(mediaDir, 'a.mkv')],
    });

    await invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, { filters: [], kind: 'video' });

    expect(setSettingMock).not.toHaveBeenCalled();
  });

  it.each([
    ['open-file', IPC_CHANNELS.DIALOG_OPEN_FILE],
    ['open-files', IPC_CHANNELS.DIALOG_OPEN_FILES],
    ['open-folder', IPC_CHANNELS.DIALOG_OPEN_FOLDER],
  ])('remembers nothing when %s is cancelled', async (_label, channel) => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await invoke(channel, { filters: [] });

    expect(setSettingMock).not.toHaveBeenCalled();
  });

  it('remembers nothing when save-file is cancelled', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });

    await invoke(IPC_CHANNELS.DIALOG_SAVE_FILE, { filters: [] });

    expect(setSettingMock).not.toHaveBeenCalled();
  });

  it('still returns the pick when persisting the directory throws', async () => {
    const picked = path.join(mediaDir, 'a.mkv');
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [picked] });
    setSettingMock.mockImplementationOnce(() => {
      throw new Error('store is read-only');
    });

    const res = await invoke<{ canceled: boolean; filePath: string | null }>(
      IPC_CHANNELS.DIALOG_OPEN_FILE,
      { filters: [], kind: 'video' }
    );

    expect(res).toEqual({ canceled: false, filePath: picked });
  });
});
