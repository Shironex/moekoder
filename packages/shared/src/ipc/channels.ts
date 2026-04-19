/**
 * IPC channel name constants.
 *
 * Channel naming convention: `<namespace>:<action>` or
 * `<namespace>:<entity>:<action>` — mirrored on both sides of the IPC
 * bridge. Both the preload allow-list and the main-process handler
 * registrations pull their names from this record so drift is impossible.
 *
 * The shared package stays runtime-dep-free on purpose; zod schemas that
 * validate payloads for each channel live in the desktop package (see
 * `apps/desktop/src/main/ipc/schemas/`).
 */
export const IPC_CHANNELS = {
  APP_VERSION: 'app:version',
  APP_OPEN_EXTERNAL: 'app:open-external',
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_SAVE_FILE: 'dialog:save-file',
  DIALOG_OPEN_FOLDER: 'dialog:open-folder',
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  STORE_DELETE: 'store:delete',
  UPDATER_CHECK: 'updater:check',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',
  FFMPEG_IS_INSTALLED: 'ffmpeg:is-installed',
  FFMPEG_GET_VERSION: 'ffmpeg:get-version',
  FFMPEG_ENSURE_BINARIES: 'ffmpeg:ensure-binaries',
  FFMPEG_PROBE: 'ffmpeg:probe',
  GPU_PROBE: 'gpu:probe',
  ENCODE_START: 'encode:start',
  ENCODE_CANCEL: 'encode:cancel',
  ENCODE_GET_PREFLIGHT: 'encode:get-preflight',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * One-way main -> renderer event channels. Renderer attaches listeners via
 * `ipcRenderer.on`; main process emits with `webContents.send`.
 */
export const UPDATER_EVENT_CHANNELS = {
  CHECKING: 'updater:checking',
  AVAILABLE: 'updater:available',
  NOT_AVAILABLE: 'updater:not-available',
  DOWNLOAD_PROGRESS: 'updater:download-progress',
  DOWNLOADED: 'updater:downloaded',
  ERROR: 'updater:error',
} as const;

export type UpdaterEventChannel =
  (typeof UPDATER_EVENT_CHANNELS)[keyof typeof UPDATER_EVENT_CHANNELS];

/**
 * One-way main -> renderer ffmpeg event channels. `DOWNLOAD_PROGRESS`
 * streams install pipeline progress so the renderer can render a live
 * progress bar during `ffmpeg:ensure-binaries`.
 */
export const FFMPEG_EVENT_CHANNELS = {
  DOWNLOAD_PROGRESS: 'ffmpeg:download-progress',
} as const;

export type FfmpegEventChannel = (typeof FFMPEG_EVENT_CHANNELS)[keyof typeof FFMPEG_EVENT_CHANNELS];

/**
 * One-way main -> renderer encode event channels. The orchestrator pushes
 * jobId-tagged payloads down these channels so a single renderer listener
 * can multiplex progress / logs / completion / error across future queued
 * jobs (queue lands in v0.3; plumbing is jobId-ready from day one).
 */
export const ENCODE_EVENT_CHANNELS = {
  PROGRESS: 'encode:progress',
  LOG: 'encode:log',
  COMPLETE: 'encode:complete',
  ERROR: 'encode:error',
} as const;

export type EncodeEventChannel = (typeof ENCODE_EVENT_CHANNELS)[keyof typeof ENCODE_EVENT_CHANNELS];
