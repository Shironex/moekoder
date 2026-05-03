/**
 * Ambient type declarations for the `window.electronAPI` surface exposed by
 * the desktop preload script. Kept structurally in sync with
 * `apps/desktop/src/types/electron-api.d.ts` — the desktop package owns the
 * runtime definition; this file re-states it in renderer-safe form (no deep
 * imports from `@moekoder/desktop` internals into the web bundle).
 *
 * When the preload surface changes, update this file and the desktop ambient
 * together. The wire-level payload shapes here are structural duplicates of
 * the desktop-internal types they mirror.
 */
import type {
  UserSettings,
  UserSettingsKey,
  UpdaterEventChannel,
  UPDATER_EVENT_CHANNELS,
  ENCODE_EVENT_CHANNELS,
} from '@moekoder/shared';

/**
 * FFmpeg install-pipeline stage — mirrors `ffmpeg/manager` InstallStage.
 * `resolving -> downloading -> verifying -> extracting -> installing -> done`.
 */
export type InstallStage =
  | 'resolving'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'done';

/** FFmpeg install-pipeline progress — mirrors `ffmpeg/manager` InstallProgress. */
export interface InstallProgress {
  stage: InstallStage;
  /** Monotonically increasing across the whole install, 0..1. */
  pct: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message?: string;
}

/** One video stream entry from ffprobe. Mirrors `ffmpeg/probe` ProbeVideoStream. */
export interface ProbeVideoStream {
  index: number;
  codec: string;
  width: number;
  height: number;
  fps: number;
}

/** One audio stream entry from ffprobe. Mirrors `ffmpeg/probe` ProbeAudioStream. */
export interface ProbeAudioStream {
  index: number;
  codec: string;
  sampleRate: number;
  channels: number;
  language?: string;
}

/** One subtitle stream entry from ffprobe. Mirrors `ffmpeg/probe` ProbeSubtitleStream. */
export interface ProbeSubtitleStream {
  index: number;
  codec: string;
  language?: string;
  title?: string;
}

/** One attachment entry from ffprobe. Mirrors `ffmpeg/probe` ProbeAttachment. */
export interface ProbeAttachment {
  index: number;
  filename?: string;
  mimeType?: string;
}

/** ffprobe-derived media summary — mirrors `ffmpeg/probe` ProbeResult verbatim. */
export interface ProbeResult {
  durationSec: number;
  format: { name: string; size: number; bitRate: number };
  videoStreams: ProbeVideoStream[];
  audioStreams: ProbeAudioStream[];
  subtitleStreams: ProbeSubtitleStream[];
  attachments: ProbeAttachment[];
}

/** Vendor identifiers the probe knows about. Mirrors `ffmpeg/gpu-probe` GpuVendor. */
export type GpuVendor = 'nvenc' | 'qsv' | 'amf' | 'videotoolbox';

/** Hardware-encoder probe summary — mirrors `ffmpeg/gpu-probe` GpuProbeResult.
 *  `available` is ordered the same way the probe inspected vendors — callers
 *  who want a single "recommended" choice should pick the first entry, or
 *  fall back to `'cpu'` when the list is empty. `details` carries the exact
 *  encoder strings matched per vendor for UI surfacing. */
export interface GpuProbeResult {
  available: GpuVendor[];
  details: Record<GpuVendor, { encoders: string[] } | null>;
}

/** Disk-space / preflight summary — mirrors `ffmpeg/disk-space` PreflightResult verbatim. */
export interface PreflightResult {
  ok: boolean;
  freeBytes: number;
  estimatedBytes: number;
  /** Safety margin added on top of the estimate before checking free space. */
  safetyMarginBytes: number;
  /** Bytes needed beyond what's free; `0` when ok. */
  shortfallBytes: number;
}

/** Streaming encode progress — mirrors `ffmpeg/processor` EncodeProgress. */
export interface EncodeProgressPayload {
  pct: number;
  fps: number;
  bitrateKbps: number;
  speed: number;
  outTimeSec: number;
  etaSec: number;
}

/** One ffmpeg stderr line, classified. Mirrors `ffmpeg/processor` LogLine. */
export interface EncodeLogLinePayload {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'trace';
  text: string;
}

/** Encode completion summary — mirrors `ffmpeg/processor` EncodeResult. */
export interface EncodeResultPayload {
  file: string;
  durationSec: number;
  bytes: number;
  avgFps: number;
}

/** Orchestrator start input — mirrors `encode/orchestrator` EncodeStartInput. */
export interface EncodeStartInput {
  videoPath: string;
  subtitlePath: string;
  outputPath: string;
  /** Optional partial encode-settings override merged onto BALANCED_PRESET. */
  settings?: Record<string, unknown>;
}

/** Orchestrator start result — mirrors `encode/orchestrator` EncodeStartResult. */
export interface EncodeStartResult {
  jobId: string;
  preflight: PreflightResult;
}

interface PreflightInput {
  videoPath: string;
  outputDir: string;
  durationSec: number;
  bitrateKbps: number;
}

/**
 * Mirror of `Electron.FileFilter` duplicated here so the renderer bundle
 * stays free of any `electron` typings import. Keep in sync with the
 * upstream shape (name + extensions array).
 */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** `dialog:open-file` / `dialog:save-file` input. */
export interface DialogFileInput {
  filters: FileFilter[];
  defaultPath?: string;
}

/** `dialog:open-folder` input. */
export interface DialogOpenFolderInput {
  defaultPath?: string;
}

/** `dialog:open-file` / `dialog:save-file` result. */
export interface DialogFileResult {
  canceled: boolean;
  filePath: string | null;
}

/** `dialog:open-files` result — multi-select variant. */
export interface DialogFilesResult {
  canceled: boolean;
  filePaths: string[];
}

/** `dialog:open-folder` result. */
export interface DialogFolderResult {
  canceled: boolean;
  folderPath: string | null;
}

export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    revealInFolder: (filePath: string) => Promise<void>;
    openLogsFolder: () => Promise<void>;
  };
  dialog: {
    openFile: (input: DialogFileInput) => Promise<DialogFileResult>;
    openFiles: (input: DialogFileInput) => Promise<DialogFilesResult>;
    saveFile: (input: DialogFileInput) => Promise<DialogFileResult>;
    openFolder: (input: DialogOpenFolderInput) => Promise<DialogFolderResult>;
  };
  fileSystem: {
    /** Resolve an absolute path for a `File` object originating from a drop event. */
    getPathForFile: (file: File) => string;
    /**
     * List the immediate children of a folder, filtered by the supplied
     * extension whitelists. Non-recursive. Used by the drop overlay to
     * resolve dropped folders into their media contents.
     */
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
    onProgress: (handler: (jobId: string, p: EncodeProgressPayload) => void) => () => void;
    onLog: (handler: (jobId: string, line: EncodeLogLinePayload) => void) => () => void;
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
    /**
     * Preload bridge. Always present inside the Electron renderer; `undefined`
     * when the Vite dev server is opened in a browser outside of Electron.
     * Call sites that run before the shell mounts should guard accordingly.
     */
    electronAPI?: ElectronAPI;
  }
}

export {};
