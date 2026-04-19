import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { createMainLogger } from '../logger';
import { IpcError } from '../ipc/errors';
import { getFfprobePath } from '../utils/bin-paths';
import { isInstalled } from './manager';

const log = createMainLogger('ffmpeg/probe');

/** Cap on ffprobe's stdout to avoid runaway memory for hostile inputs. */
const FFPROBE_MAX_BUFFER = 8 * 1024 * 1024;
const FFPROBE_TIMEOUT_MS = 30_000;

export interface ProbeVideoStream {
  index: number;
  codec: string;
  width: number;
  height: number;
  fps: number;
}

export interface ProbeAudioStream {
  index: number;
  codec: string;
  sampleRate: number;
  channels: number;
  language?: string;
}

export interface ProbeSubtitleStream {
  index: number;
  codec: string;
  language?: string;
  title?: string;
}

export interface ProbeAttachment {
  index: number;
  filename?: string;
  mimeType?: string;
}

export interface ProbeResult {
  durationSec: number;
  format: { name: string; size: number; bitRate: number };
  videoStreams: ProbeVideoStream[];
  audioStreams: ProbeAudioStream[];
  subtitleStreams: ProbeSubtitleStream[];
  attachments: ProbeAttachment[];
}

/* ---------------------------------------------------------------- */
/*  Raw ffprobe JSON shape — partial, only the fields we read.       */
/* ---------------------------------------------------------------- */

interface RawFormat {
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

interface RawStream {
  index?: number;
  codec_type?: 'video' | 'audio' | 'subtitle' | 'attachment' | string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  tags?: Record<string, string | undefined>;
}

interface RawProbe {
  format?: RawFormat;
  streams?: RawStream[];
}

/**
 * Parse `num/den` (ffprobe's `r_frame_rate` / `avg_frame_rate` form) into a
 * float. Returns 0 for 0/0 or unparseable inputs — callers treat 0 as
 * "unknown fps".
 */
function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 0;
  const [numStr, denStr] = raw.split('/');
  const num = Number(numStr);
  const den = Number(denStr ?? '1');
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

function toIntOrZero(raw: string | number | undefined): number {
  if (raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloatOrZero(raw: string | number | undefined): number {
  if (raw === undefined) return 0;
  const n = typeof raw === 'number' ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Exported for direct unit testing without spawning ffprobe. */
export function normalizeProbeJson(raw: RawProbe): ProbeResult {
  const streams = raw.streams ?? [];

  const videoStreams: ProbeVideoStream[] = streams
    .filter(s => s.codec_type === 'video')
    .map(s => ({
      index: s.index ?? 0,
      codec: s.codec_name ?? 'unknown',
      width: s.width ?? 0,
      height: s.height ?? 0,
      fps: parseFrameRate(s.avg_frame_rate) || parseFrameRate(s.r_frame_rate),
    }));

  const audioStreams: ProbeAudioStream[] = streams
    .filter(s => s.codec_type === 'audio')
    .map(s => ({
      index: s.index ?? 0,
      codec: s.codec_name ?? 'unknown',
      sampleRate: toIntOrZero(s.sample_rate),
      channels: s.channels ?? 0,
      language: s.tags?.language,
    }));

  const subtitleStreams: ProbeSubtitleStream[] = streams
    .filter(s => s.codec_type === 'subtitle')
    .map(s => ({
      index: s.index ?? 0,
      codec: s.codec_name ?? 'unknown',
      language: s.tags?.language,
      title: s.tags?.title,
    }));

  const attachments: ProbeAttachment[] = streams
    .filter(s => s.codec_type === 'attachment')
    .map(s => ({
      index: s.index ?? 0,
      filename: s.tags?.filename,
      mimeType: s.tags?.mimetype,
    }));

  return {
    durationSec: toFloatOrZero(raw.format?.duration),
    format: {
      name: raw.format?.format_name ?? 'unknown',
      size: toIntOrZero(raw.format?.size),
      bitRate: toIntOrZero(raw.format?.bit_rate),
    },
    videoStreams,
    audioStreams,
    subtitleStreams,
    attachments,
  };
}

/**
 * Spawn ffprobe against `filePath` and return a normalized metadata shape.
 * Throws `IpcError` with a specific code for the three cases the renderer
 * cares about: missing ffprobe binary (`UNAVAILABLE`), bad input path
 * (`NOT_FOUND`), and everything else (`INTERNAL`).
 */
export async function probe(filePath: string): Promise<ProbeResult> {
  if (!filePath || typeof filePath !== 'string') {
    throw new IpcError('INVALID_INPUT', 'probe(): filePath must be a non-empty string');
  }
  if (!fs.existsSync(filePath)) {
    throw new IpcError('NOT_FOUND', `probe(): file does not exist: ${filePath}`);
  }
  if (!(await isInstalled())) {
    throw new IpcError('UNAVAILABLE', 'probe(): ffmpeg binaries are not installed');
  }

  const args = [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-show_chapters',
    '-print_format',
    'json',
    filePath,
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      getFfprobePath(),
      args,
      { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: FFPROBE_MAX_BUFFER },
      (err, out) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(out);
      }
    );
  }).catch(err => {
    log.warn('ffprobe failed', err);
    throw new IpcError(
      'INTERNAL',
      `ffprobe failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  });

  let parsed: RawProbe;
  try {
    parsed = JSON.parse(stdout) as RawProbe;
  } catch (err) {
    throw new IpcError(
      'INTERNAL',
      `ffprobe returned unparseable JSON for ${filePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return normalizeProbeJson(parsed);
}
