import { ipcMain } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { IPC_CHANNELS } from '@moekoder/shared';
import { extractSubtitle, type SubtitleExtractResult } from '../../ffmpeg/subtitle-extractor';
import type { SubtitleOutputFormat } from '../../ffmpeg/subtitle-codecs';
import { getFfmpegPath } from '../../utils/bin-paths';
import { handle } from '../with-ipc-handler';
import { subtitleExtractSchema } from '../schemas/subtitle.schemas';
import type { IpcContext } from '../register';

/**
 * `subtitle:extract` input — mirrors `subtitleExtractSchema`. Listing the
 * tracks reuses `ffmpeg:probe` (which already returns `subtitleStreams[]`),
 * so this is the only subtitle-specific channel.
 */
interface SubtitleExtractInput {
  videoPath: string;
  streamIndex: number;
  codec: string;
  format?: SubtitleOutputFormat;
  outputPath: string;
}

export function registerSubtitleHandlers(_ctx: IpcContext): void {
  handle<[SubtitleExtractInput], SubtitleExtractResult>(
    IPC_CHANNELS.SUBTITLE_EXTRACT,
    subtitleExtractSchema,
    async (_event, input) => {
      // The renderer can pick an output dir that doesn't exist yet — create it
      // recursively (idempotent) before ffmpeg writes, mirroring the encode
      // orchestrator's preflight `ensureDir`.
      await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
      return extractSubtitle({
        videoPath: input.videoPath,
        streamIndex: input.streamIndex,
        codec: input.codec,
        format: input.format,
        outputPath: input.outputPath,
        ffmpegPath: getFfmpegPath(),
      });
    }
  );
}

export function cleanupSubtitleHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.SUBTITLE_EXTRACT);
}
