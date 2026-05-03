import { BrowserWindow, shell } from 'electron';
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
 * In prod we load the packaged web bundle from `dist/renderer/index.html`,
 * which the copy-renderer build step stages next to the main-process
 * output. The path is resolved relative to the compiled main entry at
 * `dist/main/window.js`.
 */
const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:15180';
const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Decide what to do when the renderer tries to open a new window
 * (`window.open`, target=_blank, popups). External http(s) URLs are handed
 * off to the OS via `shell.openExternal`; everything else (including
 * `javascript:`, `file:`, `data:`, unparseable strings) is dropped on the
 * floor. The packaged window itself never opens a child BrowserWindow.
 *
 * Exported (and pure on inputs) so the unit test can exercise the decision
 * without spinning up Electron.
 */
export function decideWindowOpen(url: string): {
  action: 'deny';
  externalUrl: string | null;
} {
  let externalUrl: string | null = null;
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      externalUrl = u.toString();
    }
  } catch {
    // Unparseable URL — drop on the floor.
  }
  return { action: 'deny', externalUrl };
}

/**
 * Decide whether an in-window navigation should be allowed. In dev we only
 * trust the Vite dev URL; in prod we only trust the local `file://` bundle.
 * Anything else (a stray `location.href = 'https://attacker'`) is blocked
 * before the navigation commits.
 */
export function isAllowedNavigation(url: string, isDev: boolean, devUrl: string): boolean {
  return isDev ? url.startsWith(devUrl) : url.startsWith('file://');
}

/**
 * Deny-by-default navigation hardening. Anything that tries to leave the
 * packaged renderer is blocked at the Electron layer instead of trusting
 * the renderer's intent. The legitimate "open this URL in the browser"
 * path runs through the `app:open-external` IPC, which has its own
 * protocol allow-list.
 */
function attachNavigationGuards(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen(url);
    if (decision.externalUrl) {
      void shell.openExternal(decision.externalUrl);
    }
    return { action: decision.action };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, IS_DEV, VITE_DEV_URL)) {
      log.warn(`[nav-guard] blocked navigation to ${url}`);
      event.preventDefault();
    }
  });
}

export function createMainWindow(): BrowserWindow {
  // Platform-dependent chrome config:
  //   · macOS keeps native traffic lights (`titleBarStyle: 'hidden'`) and
  //     offsets them vertically to sit inside our 44px titlebar. The renderer
  //     hides its custom win-controls and reserves left padding on darwin.
  //   · Windows/Linux use a frameless window; the renderer draws its own
  //     min/max/close triplet in Titlebar / OnboardingLayout.
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: isMac ? undefined : false,
    titleBarStyle: isMac ? 'hidden' : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
    // Plum background, matches the default theme's `oklch(0.12 0.018 300)` —
    // shown briefly while the renderer bundle loads. Keeping this in sync
    // with the default theme prevents a flash of the wrong color on launch.
    backgroundColor: '#1a1421',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  attachNavigationGuards(win);

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
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
