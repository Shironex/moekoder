/**
 * Renderer-side surfacing of `queue.start()` failures.
 *
 * Electron strips prototypes across IPC, so an `IpcError` thrown in main
 * arrives in the renderer as a plain object whose `name` is `'IpcError'`
 * and `code` is the original code string. We treat that structurally —
 * v0.3 doesn't pull a toast library yet (out of scope), so a clear
 * `console.error` is the surface today. v0.3.1 will replace this with a
 * proper toast / dialog once one lands; the call sites stay the same.
 */
import { logger } from './logger';

const log = logger('queue-error');

interface IpcErrorShape {
  name: 'IpcError';
  code: string;
  message: string;
  details?: unknown;
}

const isIpcErrorShape = (e: unknown): e is IpcErrorShape => {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.name === 'IpcError' && typeof obj.code === 'string';
};

interface PreflightShortfall {
  dir: string;
  requiredBytes: number;
  freeBytes: number;
  shortfallBytes: number;
}

const isPreflightDetails = (details: unknown): details is { shortfalls: PreflightShortfall[] } => {
  if (typeof details !== 'object' || details === null) return false;
  const obj = details as Record<string, unknown>;
  return Array.isArray(obj.shortfalls);
};

/**
 * Logs a `queue.start()` rejection in the most useful form available.
 * For preflight `UNAVAILABLE` errors we surface every short directory
 * by name + bytes so a future toast can read directly off the same
 * payload. For everything else we fall through to a plain warning.
 */
export const reportQueueStartError = (err: unknown): void => {
  if (isIpcErrorShape(err) && err.code === 'UNAVAILABLE' && isPreflightDetails(err.details)) {
    // Preflight rejection: show the structured shortfall list. Visible
    // in devtools today; v0.3.1 should hoist this into a dialog.
    console.error('[queue.start] preflight failed', {
      message: err.message,
      shortfalls: err.details.shortfalls,
    });
    return;
  }
  log.warn('queue.start failed', err);
};
