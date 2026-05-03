import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import {
  THEMES,
  DEFAULT_THEME_ID,
  APP_NAME,
  APP_SIGIL,
  APP_EDITION,
  ENCODE_EVENT_CHANNELS,
  FFMPEG_EVENT_CHANNELS,
  IPC_CHANNELS,
  UPDATER_EVENT_CHANNELS,
  type UpdaterEventChannel,
  type UserSettings,
  type UserSettingsKey,
} from '@moekoder/shared';
import type { InstallProgress } from './ffmpeg/manager';
import type { ProbeResult } from './ffmpeg/probe';
import type { GpuProbeResult } from './ffmpeg/gpu-probe';
import type { PreflightResult } from './ffmpeg/disk-space';
import type { EncodeProgress, EncodeResult, LogLine } from './ffmpeg/processor';
import type { EncodeStartInput, EncodeStartResult } from './encode/orchestrator';

interface PreflightInput {
  videoPath: string;
  outputDir: string;
  durationSec: number;
  bitrateKbps: number;
}

/**
 * Allow-list of IPC channels the renderer is permitted to invoke. Built from
 * the shared `IPC_CHANNELS` record so drift with the main-process handler
 * registrations is impossible — adding a channel here requires adding it to
 * the shared constants first.
 */
const ALLOWED_IPC_CHANNELS = new Set<string>(Object.values(IPC_CHANNELS));

/** Plain-object shape we reject with; mirrors the `IpcError` structural check. */
interface IpcErrorShape {
  name: 'IpcError';
  code: string;
  message: string;
  details?: unknown;
}

function makeIpcError(code: string, message: string, details?: unknown): IpcErrorShape {
  return { name: 'IpcError', code, message, details };
}

/**
 * Invoke an allow-listed IPC channel with a wall-clock timeout. Channels not
 * in the allow-list reject immediately (fast fail). The timer is `.unref()`ed
 * so it never keeps the event loop alive on its own.
 */
function invokeWithTimeout<T>(channel: string, args: unknown[], timeoutMs = 10_000): Promise<T> {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
    return Promise.reject(
      makeIpcError('PERMISSION_DENIED', `IPC channel not allowed: "${channel}"`)
    );
  }

  const invoke = ipcRenderer.invoke(channel, ...args) as Promise<T>;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        makeIpcError('TIMEOUT', `IPC timeout: "${channel}" did not respond within ${timeoutMs}ms`)
      );
      // Ensure the still-pending invoke doesn't cause unhandled rejection noise.
      invoke.catch(() => {});
    }, timeoutMs);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  });

  return Promise.race([
    invoke.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    timeout,
  ]);
}

const electronAPI = {
  app: {
    getVersion: (): Promise<string> => invokeWithTimeout<string>(IPC_CHANNELS.APP_VERSION, []),
    openExternal: (url: string): Promise<void> =>
      invokeWithTimeout<void>(IPC_CHANNELS.APP_OPEN_EXTERNAL, [url]),
    revealInFolder: (filePath: string): Promise<void> =>
      invokeWithTimeout<void>(IPC_CHANNELS.APP_REVEAL_IN_FOLDER, [filePath]),
    openLogsFolder: (): Promise<void> =>
      invokeWithTimeout<void>(IPC_CHANNELS.APP_OPEN_LOGS_FOLDER, []),
  },
  dialog: {
    // File dialogs can stay open indefinitely while the user browses — bump
    // the timeout well above the 10s default so we don't fail legitimate
    // long-running picks.
    openFile: (input: {
      filters: Electron.FileFilter[];
      defaultPath?: string;
    }): Promise<{ canceled: boolean; filePath: string | null }> =>
      invokeWithTimeout<{ canceled: boolean; filePath: string | null }>(
        IPC_CHANNELS.DIALOG_OPEN_FILE,
        [input],
        300_000
      ),
    openFiles: (input: {
      filters: Electron.FileFilter[];
      defaultPath?: string;
    }): Promise<{ canceled: boolean; filePaths: string[] }> =>
      invokeWithTimeout<{ canceled: boolean; filePaths: string[] }>(
        IPC_CHANNELS.DIALOG_OPEN_FILES,
        [input],
        300_000
      ),
    saveFile: (input: {
      filters: Electron.FileFilter[];
      defaultPath?: string;
    }): Promise<{ canceled: boolean; filePath: string | null }> =>
      invokeWithTimeout<{ canceled: boolean; filePath: string | null }>(
        IPC_CHANNELS.DIALOG_SAVE_FILE,
        [input],
        300_000
      ),
    openFolder: (input: {
      defaultPath?: string;
    }): Promise<{ canceled: boolean; folderPath: string | null }> =>
      invokeWithTimeout<{ canceled: boolean; folderPath: string | null }>(
        IPC_CHANNELS.DIALOG_OPEN_FOLDER,
        [input],
        300_000
      ),
  },
  fileSystem: {
    /**
     * Returns the absolute filesystem path for a `File` object that arrived
     * via a drag-and-drop event. Electron 32+ removed the legacy `file.path`
     * property under contextIsolation; `webUtils.getPathForFile` is the
     * supported replacement and must be reached through the preload bridge
     * because `webUtils` itself is not available in the renderer realm.
     */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
    /**
     * Enumerate the immediate children of a folder, returning files whose
     * extension matches the supplied video / subtitle whitelists. Used by
     * the drop overlay so dropped folders surface their media for auto-pair
     * without re-implementing fs in the renderer.
     */
    listFolder: (input: {
      folderPath: string;
      videoExtensions: string[];
      subtitleExtensions: string[];
    }): Promise<{ videos: string[]; subtitles: string[] }> =>
      invokeWithTimeout<{ videos: string[]; subtitles: string[] }>(
        IPC_CHANNELS.FS_LIST_FOLDER,
        [input],
        15_000
      ),
  },
  store: {
    get: <K extends UserSettingsKey>(key: K): Promise<UserSettings[K]> =>
      invokeWithTimeout<UserSettings[K]>(IPC_CHANNELS.STORE_GET, [key]),
    set: <K extends UserSettingsKey>(key: K, value: UserSettings[K]): Promise<void> =>
      invokeWithTimeout<void>(IPC_CHANNELS.STORE_SET, [key, value]),
    delete: (key: UserSettingsKey): Promise<void> =>
      invokeWithTimeout<void>(IPC_CHANNELS.STORE_DELETE, [key]),
  },
  updater: {
    check: (): Promise<void> => invokeWithTimeout<void>(IPC_CHANNELS.UPDATER_CHECK, []),
    download: (): Promise<void> => invokeWithTimeout<void>(IPC_CHANNELS.UPDATER_DOWNLOAD, []),
    install: (): Promise<void> => invokeWithTimeout<void>(IPC_CHANNELS.UPDATER_INSTALL, []),
    on: (channel: UpdaterEventChannel, handler: (payload: unknown) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: unknown): void => handler(payload);
      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
  },
  /** Enumerated updater event channel names, re-exposed for renderer convenience. */
  updaterEvents: UPDATER_EVENT_CHANNELS,
  ffmpeg: {
    isInstalled: (): Promise<boolean> =>
      invokeWithTimeout<boolean>(IPC_CHANNELS.FFMPEG_IS_INSTALLED, []),
    getVersion: (): Promise<string | null> =>
      invokeWithTimeout<string | null>(IPC_CHANNELS.FFMPEG_GET_VERSION, []),
    // Downloads can legitimately take minutes; override the 10s default.
    ensureBinaries: (): Promise<void> =>
      invokeWithTimeout<void>(IPC_CHANNELS.FFMPEG_ENSURE_BINARIES, [], 600_000),
    removeInstalled: (): Promise<void> =>
      invokeWithTimeout<void>(IPC_CHANNELS.FFMPEG_REMOVE_INSTALLED, []),
    probe: (filePath: string): Promise<ProbeResult> =>
      invokeWithTimeout<ProbeResult>(IPC_CHANNELS.FFMPEG_PROBE, [filePath], 60_000),
    onDownloadProgress: (handler: (payload: InstallProgress) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, payload: InstallProgress): void =>
        handler(payload);
      ipcRenderer.on(FFMPEG_EVENT_CHANNELS.DOWNLOAD_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(FFMPEG_EVENT_CHANNELS.DOWNLOAD_PROGRESS, listener);
      };
    },
  },
  gpu: {
    probe: (): Promise<GpuProbeResult> =>
      invokeWithTimeout<GpuProbeResult>(IPC_CHANNELS.GPU_PROBE, [], 10_000),
  },
  encode: {
    /**
     * Kicks off an encode. Returns the `jobId` + preflight snapshot once
     * ffmpeg has been spawned. Progress / completion / errors arrive via
     * the `on*` listeners below, not this promise.
     */
    start: (input: EncodeStartInput): Promise<EncodeStartResult> =>
      invokeWithTimeout<EncodeStartResult>(IPC_CHANNELS.ENCODE_START, [input], 30_000),
    cancel: (jobId: string): Promise<boolean> =>
      invokeWithTimeout<boolean>(IPC_CHANNELS.ENCODE_CANCEL, [jobId]),
    getPreflight: (input: PreflightInput): Promise<PreflightResult> =>
      invokeWithTimeout<PreflightResult>(IPC_CHANNELS.ENCODE_GET_PREFLIGHT, [input]),
    /**
     * Attaches a listener for the given encode event channel. Returns an
     * unsubscribe function — call it on unmount / when the render tree
     * no longer needs the stream. `ipcRenderer` does not expose a
     * `removeAllListeners` hook scoped per-channel, so every `on*` caller
     * is responsible for its own teardown.
     */
    onProgress: (handler: (jobId: string, p: EncodeProgress) => void): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: { jobId: string; progress: EncodeProgress }
      ): void => handler(payload.jobId, payload.progress);
      ipcRenderer.on(ENCODE_EVENT_CHANNELS.PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(ENCODE_EVENT_CHANNELS.PROGRESS, listener);
      };
    },
    onLog: (handler: (jobId: string, line: LogLine) => void): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: { jobId: string; line: LogLine }
      ): void => handler(payload.jobId, payload.line);
      ipcRenderer.on(ENCODE_EVENT_CHANNELS.LOG, listener);
      return () => {
        ipcRenderer.removeListener(ENCODE_EVENT_CHANNELS.LOG, listener);
      };
    },
    onComplete: (handler: (jobId: string, r: EncodeResult) => void): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: { jobId: string; result: EncodeResult }
      ): void => handler(payload.jobId, payload.result);
      ipcRenderer.on(ENCODE_EVENT_CHANNELS.COMPLETE, listener);
      return () => {
        ipcRenderer.removeListener(ENCODE_EVENT_CHANNELS.COMPLETE, listener);
      };
    },
    onError: (
      handler: (jobId: string, e: { code: string; message: string }) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: { jobId: string; error: { code: string; message: string } }
      ): void => handler(payload.jobId, payload.error);
      ipcRenderer.on(ENCODE_EVENT_CHANNELS.ERROR, listener);
      return () => {
        ipcRenderer.removeListener(ENCODE_EVENT_CHANNELS.ERROR, listener);
      };
    },
  },
  /** Enumerated encode event channel names, re-exposed for renderer convenience. */
  encodeEvents: ENCODE_EVENT_CHANNELS,
  window: {
    minimize: (): Promise<void> => invokeWithTimeout<void>(IPC_CHANNELS.WINDOW_MINIMIZE, []),
    maximize: (): Promise<void> => invokeWithTimeout<void>(IPC_CHANNELS.WINDOW_MAXIMIZE, []),
    close: (): Promise<void> => invokeWithTimeout<void>(IPC_CHANNELS.WINDOW_CLOSE, []),
  },
} as const;

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Phase-1 placeholder surface kept alive so `shell.html` continues to work.
// The real renderer (Phase 4) consumes `electronAPI` instead.
contextBridge.exposeInMainWorld('moekoder', {
  app: { name: APP_NAME, sigil: APP_SIGIL, edition: APP_EDITION },
  themes: THEMES,
  defaultThemeId: DEFAULT_THEME_ID,
});
