/**
 * Structured error type for IPC handler failures.
 *
 * Handlers throw `IpcError(code, message, details?)` on any failure the
 * renderer needs to discriminate. `ipcMain.handle` propagates thrown values
 * as rejected promises on the renderer side — Electron strips prototypes
 * across that boundary, so renderer code must use the structural
 * `isIpcError` check below instead of `instanceof`.
 */
export type IpcErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'INTERNAL'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PERMISSION_DENIED';

export class IpcError extends Error {
  readonly code: IpcErrorCode | string;
  readonly details?: unknown;

  constructor(code: IpcErrorCode | string, message: string, details?: unknown) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Structural check for `IpcError` on either side of the IPC bridge.
 * Electron strips prototypes when rejecting across IPC, so we cannot rely on
 * `instanceof`. A plain `{ name: 'IpcError', code: string }` is sufficient to
 * treat the value as a recognised IPC failure.
 */
export function isIpcError(
  e: unknown
): e is { name: 'IpcError'; code: string; message: string; details?: unknown } {
  if (typeof e !== 'object' || e === null) return false;
  const obj = e as Record<string, unknown>;
  return obj.name === 'IpcError' && typeof obj.code === 'string';
}
