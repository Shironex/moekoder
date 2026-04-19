import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ZodTuple, ZodTypeAny } from 'zod';
import { createLogger } from '@moekoder/shared';
import { IpcError } from './errors';

type Handler<TArgs extends unknown[], TReturn> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<TReturn> | TReturn;

/**
 * Validates the renderer-supplied positional args against a zod tuple schema.
 * Throws `IpcError('INVALID_INPUT', …, issues)` on failure so the renderer
 * sees a stable structured error regardless of the handler internals.
 */
function validateArgs<TArgs extends unknown[]>(
  channel: string,
  schema: ZodTuple<[ZodTypeAny, ...ZodTypeAny[]] | []>,
  rawArgs: unknown[]
): TArgs {
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    throw new IpcError('INVALID_INPUT', `Invalid payload for ${channel}`, parsed.error.issues);
  }
  return parsed.data as unknown as TArgs;
}

/**
 * Registers an `ipcMain.handle` for `channel`, validating args with the
 * optional zod tuple schema and logging entry/exit under `[ipc:<channel>]`.
 *
 * `IpcError` instances are re-thrown as-is so the renderer can discriminate
 * on `.code`. Anything else is logged and wrapped in
 * `IpcError('INTERNAL', …)` so handler internals never leak to the renderer.
 */
export function handle<TArgs extends unknown[], TReturn>(
  channel: string,
  schema: ZodTuple<[ZodTypeAny, ...ZodTypeAny[]] | []> | undefined,
  fn: Handler<TArgs, TReturn>
): void {
  const log = createLogger(`ipc:${channel}`);
  ipcMain.handle(channel, async (event, ...rawArgs) => {
    const args = schema ? validateArgs<TArgs>(channel, schema, rawArgs) : (rawArgs as TArgs);
    log.debug('invoke');
    try {
      const result = await fn(event, ...args);
      log.debug('ok');
      return result;
    } catch (err) {
      if (err instanceof IpcError) {
        log.warn('ipc-error', { code: err.code, message: err.message });
        throw err;
      }
      log.error('unhandled', err);
      throw new IpcError('INTERNAL', err instanceof Error ? err.message : 'Unknown error');
    }
  });
}

/**
 * Variant of `handle` that returns `fallback` on non-IpcError failures
 * instead of throwing. Use for channels with a legitimate degraded default.
 *
 * `IpcError('INVALID_INPUT')` from validation bypasses the fallback — the
 * fallback is for degraded upstream, not for tampered input.
 */
export function handleWithFallback<TArgs extends unknown[], TReturn>(
  channel: string,
  schema: ZodTuple<[ZodTypeAny, ...ZodTypeAny[]] | []> | undefined,
  fn: Handler<TArgs, TReturn>,
  fallback: TReturn
): void {
  const log = createLogger(`ipc:${channel}`);
  ipcMain.handle(channel, async (event, ...rawArgs) => {
    const args = schema ? validateArgs<TArgs>(channel, schema, rawArgs) : (rawArgs as TArgs);
    log.debug('invoke');
    try {
      const result = await fn(event, ...args);
      log.debug('ok');
      return result;
    } catch (err) {
      if (err instanceof IpcError) {
        log.warn('ipc-error', { code: err.code, message: err.message });
        throw err;
      }
      log.warn('using fallback', err);
      return fallback;
    }
  });
}
