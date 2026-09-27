import type { ProbeResult } from '@/types/electron-api';
import { EXTRACT_SOURCE } from './files';

/**
 * ffprobe summary for the Extract screen's source: two ASS tracks, one SRT
 * and one image-based PGS track (listed but not selectable).
 */
const EXTRACT_PROBE: ProbeResult = {
  durationSec: 1422.5,
  format: { name: 'matroska,webm', size: 1_402_000_000, bitRate: 7_885_000 },
  videoStreams: [{ index: 0, codec: 'hevc', width: 1920, height: 1080, fps: 23.976 }],
  audioStreams: [{ index: 1, codec: 'aac', sampleRate: 48_000, channels: 2, language: 'jpn' }],
  subtitleStreams: [
    { index: 2, codec: 'ass', language: 'eng', title: 'Full Subtitles [Moonlark]' },
    { index: 3, codec: 'ass', language: 'eng', title: 'Signs & Songs [Moonlark]' },
    { index: 4, codec: 'subrip', language: 'pol', title: 'Polski' },
    { index: 5, codec: 'hdmv_pgs_subtitle', language: 'jpn' },
  ],
  attachments: [],
};

/** Any other file: a plain 24-minute 1080p episode with one ASS track. */
const EPISODE_PROBE: ProbeResult = {
  durationSec: 1445,
  format: { name: 'matroska,webm', size: 1_318_000_000, bitRate: 7_297_000 },
  videoStreams: [{ index: 0, codec: 'h264', width: 1920, height: 1080, fps: 23.976 }],
  audioStreams: [{ index: 1, codec: 'aac', sampleRate: 48_000, channels: 2, language: 'jpn' }],
  subtitleStreams: [{ index: 2, codec: 'ass', language: 'eng', title: 'English [Moonlark]' }],
  attachments: [],
};

export const probeFor = (filePath: string): ProbeResult =>
  structuredClone(filePath === EXTRACT_SOURCE ? EXTRACT_PROBE : EPISODE_PROBE);
