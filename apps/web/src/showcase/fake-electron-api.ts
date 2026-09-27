/**
 * A fixture `window.electronAPI` for the showcase build. It satisfies the real
 * `ElectronAPI` contract, so tsc flags any preload drift, and answers from
 * memory: nothing touches the disk, ffmpeg, the GPU or the network.
 *
 * Encode events never fire on their own. The capture drives them through the
 * returned `controls`, so every progress number on screen is one it chose.
 */
import {
  BENCHMARK_EVENT_CHANNELS,
  ENCODE_EVENT_CHANNELS,
  QUEUE_EVENT_CHANNELS,
  UI_LANGUAGE_STORAGE_KEY,
  UPDATER_EVENT_CHANNELS,
  USER_SETTINGS_DEFAULTS,
  isSupportedLanguage,
  type CustomPreset,
  type QueueSettings,
  type UserSettings,
  type UserSettingsKey,
} from '@moekoder/shared';
import type {
  ElectronAPI,
  EncodeLogLinePayload,
  EncodeProgressPayload,
  EncodeResultPayload,
  GpuProbeResult,
  PreflightResult,
} from '@/types/electron-api';
import { version as APP_VERSION } from '../../package.json';
import { OPEN_FILE_BY_FILTER } from './fixtures/files';
import { probeFor } from './fixtures/probe';
import { queueSnapshot } from './fixtures/queue';

/** Hooks the capture calls through `page.evaluate` to play an encode. */
export interface ShowcaseControls {
  emitEncodeProgress: (progress: EncodeProgressPayload) => void;
  emitEncodeLog: (line: EncodeLogLinePayload) => void;
  emitEncodeComplete: (result: EncodeResultPayload) => void;
  emitEncodeError: (error: { code: string; message: string }) => void;
}

const JOB_ID = 'showcase-job-1';

const ARCHIVE_PRESET: CustomPreset = {
  version: 1,
  id: 'showcase-preset-archive',
  name: 'Archive (HEVC, CQ 18)',
  createdAt: Date.UTC(2026, 8, 20, 18, 0, 0),
  settings: {
    codec: 'hevc',
    hwAccel: 'nvenc',
    rateControl: 'cq',
    cq: 18,
    nvencPreset: 'p6',
    container: 'mkv',
    audio: 'copy',
    tune: 'animation',
  },
};

/**
 * Settings as a first launch sees them, plus the picks the wizard would
 * make on this invented machine (NVENC detected). The UI language comes
 * from the localStorage mirror the capture seeds before loading the page;
 * without it `useUiLanguageSync` would switch back to the detected locale.
 */
function seedSettings(): UserSettings {
  const settings: UserSettings = {
    ...structuredClone(USER_SETTINGS_DEFAULTS),
    hwChoice: 'nvenc',
    queueConcurrency: 2,
    customPresets: [ARCHIVE_PRESET],
  };
  try {
    const language = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(language)) settings.uiLanguage = language;
  } catch {
    // localStorage unavailable: keep the detected-language default.
  }
  return settings;
}

const GPU_PROBE: GpuProbeResult = {
  available: ['nvenc'],
  details: {
    nvenc: { encoders: ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc'] },
    qsv: null,
    amf: null,
    videotoolbox: null,
  },
  verified: true,
};

const PREFLIGHT: PreflightResult = {
  ok: true,
  freeBytes: 612_000_000_000,
  estimatedBytes: 1_006_000_000,
  safetyMarginBytes: 500_000_000,
  shortfallBytes: 0,
};

const resolved = <T>(value: T): Promise<T> => Promise.resolve(value);
const done = (): Promise<void> => Promise.resolve();
/** Subscription for a channel the showcase never fires. */
const silent = (): (() => void) => () => {};

/** A listener set whose `add` returns the unsubscribe the preload would. */
function listeners<H>() {
  const set = new Set<H>();
  return {
    add(handler: H): () => void {
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    each(fn: (handler: H) => void): void {
      for (const handler of [...set]) fn(handler);
    },
  };
}

export function createFakeElectronApi(): { api: ElectronAPI; controls: ShowcaseControls } {
  const settings = seedSettings();
  const resetSetting = <K extends UserSettingsKey>(key: K): void => {
    settings[key] = structuredClone(USER_SETTINGS_DEFAULTS[key]);
  };
  let queueSettings: QueueSettings = queueSnapshot().settings;

  const progress = listeners<(jobId: string, p: EncodeProgressPayload) => void>();
  const log = listeners<(jobId: string, line: EncodeLogLinePayload) => void>();
  const complete = listeners<(jobId: string, result: EncodeResultPayload) => void>();
  const failure = listeners<(jobId: string, error: { code: string; message: string }) => void>();

  const api: ElectronAPI = {
    app: {
      getVersion: () => resolved(APP_VERSION),
      openExternal: done,
      revealInFolder: done,
      openLogsFolder: done,
    },
    dialog: {
      openFile: input => {
        const filePath = OPEN_FILE_BY_FILTER[input.filters[0]?.name ?? ''] ?? null;
        return resolved({ canceled: filePath === null, filePath });
      },
      openFiles: () => resolved({ canceled: true, filePaths: [] }),
      saveFile: () => resolved({ canceled: true, filePath: null }),
      openFolder: () => resolved({ canceled: true, folderPath: null }),
    },
    fileSystem: {
      getPathForFile: file => file.name,
      listFolder: () => resolved({ videos: [], subtitles: [] }),
    },
    store: {
      get: key => resolved(structuredClone(settings[key])),
      set: (key, value) => {
        settings[key] = structuredClone(value);
        return done();
      },
      delete: key => {
        resetSetting(key);
        return done();
      },
    },
    updater: {
      check: done,
      download: done,
      install: done,
      on: silent,
    },
    updaterEvents: UPDATER_EVENT_CHANNELS,
    ffmpeg: {
      isInstalled: () => resolved(true),
      getVersion: () => resolved('n8.1'),
      ensureBinaries: done,
      removeInstalled: done,
      probe: filePath => resolved(probeFor(filePath)),
      onDownloadProgress: silent,
    },
    subtitle: {
      extract: input => resolved({ outputPath: input.outputPath, streamIndex: input.streamIndex }),
    },
    gpu: {
      probe: () => resolved(structuredClone(GPU_PROBE)),
    },
    encode: {
      start: () => resolved({ jobId: JOB_ID, preflight: { ...PREFLIGHT } }),
      cancel: () => resolved(true),
      getPreflight: () => resolved({ ...PREFLIGHT }),
      onProgress: progress.add,
      onLog: log.add,
      onComplete: complete.add,
      onError: failure.add,
    },
    encodeEvents: ENCODE_EVENT_CHANNELS,
    benchmark: {
      run: () => resolved([]),
      onProgress: silent,
      onLog: silent,
    },
    benchmarkEvents: BENCHMARK_EVENT_CHANNELS,
    queue: {
      getSnapshot: () => resolved({ ...queueSnapshot(), settings: { ...queueSettings } }),
      addItems: () => resolved([]),
      removeItem: () => resolved(false),
      reorder: done,
      updateOutput: () => resolved(false),
      start: done,
      pause: done,
      resume: done,
      clearDone: done,
      cancelItem: () => resolved(false),
      retryItem: () => resolved(false),
      setSettings: partial => {
        queueSettings = { ...queueSettings, ...partial };
        return resolved({ ...queueSettings });
      },
      onChanged: silent,
      onItemProgress: silent,
      onItemLog: silent,
    },
    queueEvents: QUEUE_EVENT_CHANNELS,
    window: {
      minimize: done,
      maximize: done,
      close: done,
    },
  };

  const controls: ShowcaseControls = {
    emitEncodeProgress: p => progress.each(handler => handler(JOB_ID, p)),
    emitEncodeLog: line => log.each(handler => handler(JOB_ID, line)),
    emitEncodeComplete: result => complete.each(handler => handler(JOB_ID, result)),
    emitEncodeError: error => failure.each(handler => handler(JOB_ID, error)),
  };

  return { api, controls };
}
