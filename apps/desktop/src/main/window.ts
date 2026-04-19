import { BrowserWindow } from 'electron';
import * as path from 'node:path';
import { log } from './logger';

/**
 * Console messages that match any of these patterns are dropped before they
 * hit the file transport. Keep the list short — too aggressive filtering
 * swallows real regressions.
 */
const NOISY_PATTERNS: RegExp[] = [/\[HMR\]/, /Electron Security Warning/, /React DevTools/];

function isNoisy(message: string): boolean {
  return NOISY_PATTERNS.some(rx => rx.test(message));
}

/**
 * Creates the main application `BrowserWindow`, attaches the console
 * forwarder (renderer console -> main-process logger), and loads the
 * placeholder `shell.html`. The renderer in Phase 4 will replace the file
 * load with the Vite dev server in dev and a packaged bundle in prod.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0b1224',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Forward renderer console messages to the main-process log file.
  // Electron 40+ uses the single-object signature — pluck fields off the event.
  win.webContents.on('console-message', event => {
    const message = event.message;
    if (isNoisy(message)) return;
    const source = event.sourceId ? `${event.sourceId}:${event.lineNumber}` : '';
    switch (event.level) {
      case 'error':
        log.error(`[renderer] ${message}`, source);
        break;
      case 'warning':
        log.warn(`[renderer] ${message}`, source);
        break;
      case 'info':
        log.info(`[renderer] ${message}`, source);
        break;
      default:
        log.debug(`[renderer] ${message}`, source);
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error(`[renderer] Process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error(`[renderer] Failed to load: ${errorDescription} (code: ${errorCode})`);
  });

  win.loadFile(path.join(__dirname, 'shell.html'));
  return win;
}
