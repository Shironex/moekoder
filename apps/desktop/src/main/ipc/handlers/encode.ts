import { ipcMain } from 'electron';
import { ENCODE_EVENT_CHANNELS, IPC_CHANNELS } from '@moekoder/shared';
import { checkPreflight, type PreflightResult } from '../../ffmpeg/disk-space';
import {
  cancelEncode,
  startEncode,
  type EncodeStartInput,
  type EncodeStartResult,
} from '../../encode/orchestrator';
import { handle } from '../with-ipc-handler';
import {
  encodeCancelSchema,
  encodeGetPreflightSchema,
  encodeStartSchema,
} from '../schemas/encode.schemas';
import type { IpcContext } from '../register';

/**
 * The `settings` field in `encode:start` is validated as a loose
 * `Record<string, unknown>` at the schema layer; the orchestrator picks
 * the per-codec default via `defaultsFor(settings.codec)`, spreads the
 * partial on top, and discards keys that aren't on the discriminated
 * `EncodingSettings` shape. The renderer never sees the union type.
 */

interface PreflightRequest {
  videoPath: string;
  outputDir: string;
  durationSec: number;
  bitrateKbps: number;
}

export function registerEncodeHandlers(ctx: IpcContext): void {
  const { mainWindow } = ctx;

  const safeSend = (channel: string, payload: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  handle<[EncodeStartInput], EncodeStartResult>(
    IPC_CHANNELS.ENCODE_START,
    encodeStartSchema,
    async (_event, input) => {
      // Zod's `record(string, unknown)` already type-narrows `input.settings`
      // to `Record<string, unknown> | undefined`; cast to the typed partial
      // so the orchestrator sees a familiar shape.
      const typedInput: EncodeStartInput = {
        videoPath: input.videoPath,
        subtitlePath: input.subtitlePath,
        outputPath: input.outputPath,
        settings: input.settings as Record<string, unknown> | undefined,
      };
      return startEncode(typedInput, {
        onProgress: (jobId, progress) =>
          safeSend(ENCODE_EVENT_CHANNELS.PROGRESS, { jobId, progress }),
        onLog: (jobId, line) => safeSend(ENCODE_EVENT_CHANNELS.LOG, { jobId, line }),
        // The renderer contract uses `file` + `bytes`; the main-process
        // domain type uses `outputPath` + `outputBytes`. Normalize here at
        // the wire boundary so neither side has to know about the other's
        // field names.
        onComplete: (jobId, result) =>
          safeSend(ENCODE_EVENT_CHANNELS.COMPLETE, {
            jobId,
            result: {
              file: result.outputPath,
              bytes: result.outputBytes,
              durationSec: result.durationSec,
              avgFps: result.avgFps,
            },
          }),
        onError: (jobId, error) => safeSend(ENCODE_EVENT_CHANNELS.ERROR, { jobId, error }),
      });
    }
  );

  handle<[string], boolean>(IPC_CHANNELS.ENCODE_CANCEL, encodeCancelSchema, (_event, jobId) =>
    cancelEncode(jobId)
  );

  handle<[PreflightRequest], PreflightResult>(
    IPC_CHANNELS.ENCODE_GET_PREFLIGHT,
    encodeGetPreflightSchema,
    (_event, req) => checkPreflight(req.outputDir, req.durationSec, req.bitrateKbps)
  );
}

export function cleanupEncodeHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.ENCODE_START);
  ipcMain.removeHandler(IPC_CHANNELS.ENCODE_CANCEL);
  ipcMain.removeHandler(IPC_CHANNELS.ENCODE_GET_PREFLIGHT);
}
