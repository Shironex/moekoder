/**
 * Ambient type declarations for the `window.electronAPI` surface exposed by
 * the preload script (`src/main/preload.ts`). Kept in sync manually because
 * the preload runs in a separate compilation unit from the renderer.
 *
 * Type re-exports from the desktop main process use `import type`, so no
 * main-process runtime code ever reaches the renderer bundle.
 */
import type {
  UserSettings,
  UserSettingsKey,
  UpdaterEventChannel,
  UPDATER_EVENT_CHANNELS,
  ENCODE_EVENT_CHANNELS,
} from '@moekoder/shared';
import type { InstallProgress } from '../main/ffmpeg/manager';
import type { ProbeResult } from '../main/ffmpeg/probe';
import type { GpuProbeResult } from '../main/ffmpeg/gpu-probe';
import type { PreflightResult } from '../main/ffmpeg/disk-space';
import type { EncodeProgress, LogLine } from '../main/ffmpeg/processor';
import type { EncodeStartInput, EncodeStartResult } from '../main/encode/orchestrator';

/**
 * Wire-level encode completion payload. The handler (`handlers/encode.ts`)
 * normalizes `FFmpegProcessor.EncodeResult` — which uses `outputPath` /
 * `outputBytes` — into this shape before sending over IPC, so the renderer
 * sees a stable `{ file, bytes, ... }` contract.
 */
export interface EncodeResultPayload {
  file: string;
  durationSec: number;
  bytes: number;
  avgFps: number;
}

interface PreflightInput {
  videoPath: string;
  outputDir: string;
  durationSec: number;
  bitrateKbps: number;
}

export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    revealInFolder: (filePath: string) => Promise<void>;
    openLogsFolder: () => Promise<void>;
  };
  dialog: {
    openFile: (input: {
      filters: Electron.FileFilter[];
      defaultPath?: string;
    }) => Promise<{ canceled: boolean; filePath: string | null }>;
    openFiles: (input: {
      filters: Electron.FileFilter[];
      defaultPath?: string;
    }) => Promise<{ canceled: boolean; filePaths: string[] }>;
    saveFile: (input: {
      filters: Electron.FileFilter[];
      defaultPath?: string;
    }) => Promise<{ canceled: boolean; filePath: string | null }>;
    openFolder: (input: {
      defaultPath?: string;
    }) => Promise<{ canceled: boolean; folderPath: string | null }>;
  };
  fileSystem: {
    getPathForFile: (file: File) => string;
    listFolder: (input: {
      folderPath: string;
      videoExtensions: string[];
      subtitleExtensions: string[];
    }) => Promise<{ videos: string[]; subtitles: string[] }>;
  };
  store: {
    get: <K extends UserSettingsKey>(key: K) => Promise<UserSettings[K]>;
    set: <K extends UserSettingsKey>(key: K, value: UserSettings[K]) => Promise<void>;
    delete: (key: UserSettingsKey) => Promise<void>;
  };
  updater: {
    check: () => Promise<void>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    on: (channel: UpdaterEventChannel, handler: (payload: unknown) => void) => () => void;
  };
  updaterEvents: typeof UPDATER_EVENT_CHANNELS;
  ffmpeg: {
    isInstalled: () => Promise<boolean>;
    getVersion: () => Promise<string | null>;
    ensureBinaries: () => Promise<void>;
    removeInstalled: () => Promise<void>;
    probe: (filePath: string) => Promise<ProbeResult>;
    onDownloadProgress: (handler: (payload: InstallProgress) => void) => () => void;
  };
  gpu: {
    probe: () => Promise<GpuProbeResult>;
  };
  encode: {
    start: (input: EncodeStartInput) => Promise<EncodeStartResult>;
    cancel: (jobId: string) => Promise<boolean>;
    getPreflight: (input: PreflightInput) => Promise<PreflightResult>;
    onProgress: (handler: (jobId: string, p: EncodeProgress) => void) => () => void;
    onLog: (handler: (jobId: string, line: LogLine) => void) => () => void;
    onComplete: (handler: (jobId: string, result: EncodeResultPayload) => void) => () => void;
    onError: (
      handler: (jobId: string, error: { code: string; message: string }) => void
    ) => () => void;
  };
  encodeEvents: typeof ENCODE_EVENT_CHANNELS;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
