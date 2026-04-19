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
 * renderer: Vite dev server in development, packaged bundle in production.
 *
 * In dev the Vite server address comes from VITE_DEV_SERVER_URL if set,
 * otherwise defaults to http://localhost:15180 (the VITE_DEV_PORT constant
 * in @moekoder/shared). DevTools opens detached so it doesn't steal the
 * main window's layout.
 *
 * In prod we still load the Phase 1 placeholder `shell.html` — swapping
 * to the real web bundle is tracked for later phases once the
 * copy-renderer step exists.
 */
const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:15180';
const IS_DEV = process.env.NODE_ENV === 'development';

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

  if (IS_DEV) {
    void win.loadURL(VITE_DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, 'shell.html'));
  }

  return win;
}
