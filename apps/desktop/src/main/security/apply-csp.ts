import type { Session } from 'electron';
import { IS_DEV, buildCsp } from './csp';

/**
 * Installs the CSP header on every response that flows through the given
 * Electron `Session` via `webRequest.onHeadersReceived`. Existing headers are
 * preserved — DevTools occasionally adds its own, and we do not want to
 * clobber them.
 *
 * Called once during `app.whenReady` from the main-process bootstrap.
 */
export function applyCsp(session: Session): void {
  const cspValue = buildCsp(IS_DEV);

  session.webRequest.onHeadersReceived((details, callback) => {
    const existing = details.responseHeaders ?? {};
    callback({
      responseHeaders: {
        ...existing,
        'Content-Security-Policy': [cspValue],
      },
    });
  });
}
