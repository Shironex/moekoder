import type { BrowserWindow } from 'electron';
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import { UPDATER_EVENT_CHANNELS } from '@moekoder/shared';
import { createMainLogger } from './logger';
import { getSetting, onSettingChange } from './store';

const log = createMainLogger('updater');

/** Initial check delay after `whenReady` fires when auto-check is enabled. */
const INITIAL_CHECK_DELAY_MS = 5_000;
/** Periodic check interval after the initial check. */
const PERIODIC_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

let mainWindowRef: BrowserWindow | null = null;
let initialized = false;
let enabled = false;
let initialTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

function parseReleaseNotes(notes: UpdateInfo['releaseNotes']): string | null {
  if (!notes) return null;
  if (typeof notes === 'string') return notes;
  return notes
    .map(entry => entry.note)
    .filter((n): n is string => Boolean(n))
    .join('\n\n');
}

function sendToRenderer(channel: string, payload?: unknown): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, payload);
  }
}

function startAutoCheckTimers(): void {
  if (initialTimer || periodicTimer) return;
  log.info('Enabling background update checks');
  initialTimer = setTimeout(() => {
    void runCheck();
  }, INITIAL_CHECK_DELAY_MS);
  if (typeof initialTimer === 'object' && 'unref' in initialTimer) {
    initialTimer.unref();
  }
  periodicTimer = setInterval(() => {
    void runCheck();
  }, PERIODIC_CHECK_INTERVAL_MS);
  if (typeof periodicTimer === 'object' && 'unref' in periodicTimer) {
    periodicTimer.unref();
  }
}

function stopAutoCheckTimers(): void {
  if (!initialTimer && !periodicTimer) return;
  log.info('Disabling background update checks');
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

/**
 * Wires `electron-updater` to the renderer.
 *
 * - Skipped entirely on macOS (no code signing yet; squirrel.mac would fail).
 * - `autoDownload` is off so the user can opt in per-release; the main
 *   process runs the download only when the renderer invokes
 *   `updater:download`.
 * - `autoInstallOnAppQuit` is on so a downloaded update installs silently at
 *   the next graceful shutdown.
 *
 * Background checks (5s + hourly) only run when `autoCheckUpdates === true`
 * in user settings — default `false` per the onboarding Privacy pledge. The
 * manual `updater:check` IPC always works regardless of the toggle. We
 * subscribe to store changes so flipping the toggle in Settings takes
 * effect immediately, no restart required.
 *
 * Event forwarding: the six native updater events map 1:1 onto the
 * `UPDATER_EVENT_CHANNELS` set in `@moekoder/shared`. Renderer code subscribes
 * via `electronAPI.updater.on(channel, handler)`.
 */
export function initUpdater(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  if (process.platform === 'darwin') {
    log.info('Auto-updater disabled on macOS (no code signing yet)');
    enabled = false;
    return;
  }

  enabled = true;

  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update');
    sendToRenderer(UPDATER_EVENT_CHANNELS.CHECKING);
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info(`Update available: ${info.version}`);
    sendToRenderer(UPDATER_EVENT_CHANNELS.AVAILABLE, {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info(`Up to date: ${info.version}`);
    sendToRenderer(UPDATER_EVENT_CHANNELS.NOT_AVAILABLE);
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    sendToRenderer(UPDATER_EVENT_CHANNELS.DOWNLOAD_PROGRESS, {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info(`Update downloaded: ${info.version}`);
    sendToRenderer(UPDATER_EVENT_CHANNELS.DOWNLOADED, {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    log.error('Updater error:', error.message);
    sendToRenderer(UPDATER_EVENT_CHANNELS.ERROR, error.message);
  });

  if (getSetting('autoCheckUpdates')) {
    startAutoCheckTimers();
  }

  onSettingChange('autoCheckUpdates', next => {
    if (next) startAutoCheckTimers();
    else stopAutoCheckTimers();
  });
}

async function runCheck(): Promise<void> {
  if (!enabled) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    log.warn('checkForUpdates threw:', err);
  }
}

export async function checkForUpdates(): Promise<void> {
  if (!enabled) return;
  await autoUpdater.checkForUpdates();
}

export async function downloadUpdate(): Promise<void> {
  if (!enabled) return;
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  if (!enabled) return;
  autoUpdater.quitAndInstall();
}
