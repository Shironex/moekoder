/**
 * `benchmark:run` IPC handler.
 *
 * Runs all candidates sequentially via `runBenchmark`, streams progress
 * + log events down the dedicated benchmark event channels, and resolves
 * with the per-candidate result table. The handler intentionally does
 * NOT mirror benchmark events onto the regular encode-event channels —
 * the renderer's encode store would otherwise misinterpret the test
 * encodes as real-job progress.
 */
import { ipcMain } from 'electron';
import { BENCHMARK_EVENT_CHANNELS, IPC_CHANNELS } from '@moekoder/shared';
import {
  runBenchmark,
  type BenchmarkCandidate,
  type BenchmarkCandidateResult,
} from '../../encode/benchmark';
import { handle } from '../with-ipc-handler';
import { benchmarkRunSchema } from '../schemas/benchmark.schemas';
import type { IpcContext } from '../register';

interface BenchmarkRunInput {
  videoPath: string;
  subtitlePath: string;
  startSec?: number;
  durationSec?: number;
  candidates: BenchmarkCandidate[];
}

export function registerBenchmarkHandlers(ctx: IpcContext): void {
  const { mainWindow } = ctx;

  const safeSend = (channel: string, payload: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  handle<[BenchmarkRunInput], BenchmarkCandidateResult[]>(
    IPC_CHANNELS.BENCHMARK_RUN,
    benchmarkRunSchema,
    async (_event, input) => {
      return runBenchmark(input, {
        onProgress: progress => safeSend(BENCHMARK_EVENT_CHANNELS.PROGRESS, progress),
        onLog: line => safeSend(BENCHMARK_EVENT_CHANNELS.LOG, line),
      });
    }
  );
}

export function cleanupBenchmarkHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.BENCHMARK_RUN);
}
