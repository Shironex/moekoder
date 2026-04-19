import { VITE_DEV_PORT } from '@moekoder/shared';

/**
 * True when the main process is running under `NODE_ENV=development`.
 * Centralised so CSP, console forwarder, and renderer-load paths agree.
 */
export const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Builds the `Content-Security-Policy` header value.
 *
 * Dev mode is intentionally relaxed to let Vite inject HMR code
 * (`'unsafe-eval'`, `'unsafe-inline'`, the dev-server origin on the
 * script/connect directives). Production is strict: script/style/connect are
 * locked to the packaged assets plus GitHub's API for `electron-updater`.
 */
export function buildCsp(isDev: boolean): string {
  if (isDev) {
    const dev = `http://localhost:${VITE_DEV_PORT}`;
    const devWs = `ws://localhost:${VITE_DEV_PORT}`;
    return [
      "default-src 'self'",
      `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${dev}`,
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ${dev} ${devWs}`,
      "img-src 'self' data:",
    ].join('; ');
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://api.github.com",
    "img-src 'self' data:",
  ].join('; ');
}
