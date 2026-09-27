import {
  QUEUE_SNAPSHOT_VERSION,
  type QueueItem,
  type QueueItemProgress,
  type QueueItemStatus,
  type QueueSnapshot,
} from '@moekoder/shared';
import {
  episodeOutput,
  episodeSubtitle,
  episodeSubtitleName,
  episodeVideo,
  episodeVideoName,
} from './files';

/** 2026-09-27 17:30 UTC; fixed so nothing depends on the capture's clock. */
const QUEUED_AT = Date.UTC(2026, 8, 27, 17, 30, 0);

interface ItemSeed {
  show: string;
  episode: number;
  status: QueueItemStatus;
  progress?: QueueItemProgress;
  attempts?: number;
  lastError?: string;
}

const SEEDS: readonly ItemSeed[] = [
  { show: 'Paper Moon Diaries', episode: 4, status: 'done' },
  {
    show: 'Paper Moon Diaries',
    episode: 5,
    status: 'active',
    progress: {
      pct: 71.4,
      fps: 128.4,
      bitrateKbps: 4980,
      speed: 5.36,
      outTimeSec: 1018,
      etaSec: 76,
    },
  },
  {
    show: 'Paper Moon Diaries',
    episode: 6,
    status: 'active',
    progress: {
      pct: 38.2,
      fps: 131.7,
      bitrateKbps: 5210,
      speed: 5.49,
      outTimeSec: 545,
      etaSec: 160,
    },
  },
  { show: 'Starlit Vending Machine', episode: 11, status: 'wait' },
  { show: 'Starlit Vending Machine', episode: 12, status: 'wait' },
  {
    show: 'Iron Bloom Squadron',
    episode: 7,
    status: 'error',
    attempts: 2,
    lastError: 'ffmpeg exited with code 1',
  },
  {
    show: 'Nocturne Garden',
    episode: 2,
    status: 'cancelled',
    lastError: 'Encode cancelled',
  },
];

const toItem = (seed: ItemSeed, index: number): QueueItem => {
  const addedAt = QUEUED_AT + index * 1000;
  const started = seed.status !== 'wait';
  const finished = seed.status === 'done' || seed.status === 'error' || seed.status === 'cancelled';
  return {
    id: `showcase-item-${index + 1}`,
    videoPath: episodeVideo(seed.show, seed.episode),
    videoName: episodeVideoName(seed.show, seed.episode),
    subtitlePath: episodeSubtitle(seed.show, seed.episode),
    subtitleName: episodeSubtitleName(seed.show, seed.episode),
    outputPath: episodeOutput(seed.show, seed.episode),
    status: seed.status,
    progress: seed.progress ?? null,
    attempts: seed.attempts ?? 0,
    lastError: seed.lastError ?? null,
    addedAt,
    startedAt: started ? addedAt + 60_000 : null,
    completedAt: finished ? addedAt + 330_000 : null,
    logs: [],
  };
};

/** A running queue, two jobs in parallel, one of every other status. */
export const queueSnapshot = (): QueueSnapshot => ({
  version: QUEUE_SNAPSHOT_VERSION,
  savedAt: QUEUED_AT + 600_000,
  settings: { concurrency: 2, maxRetries: 2, backoffMs: 4000, encoding: {} },
  items: SEEDS.map(toItem),
  running: true,
  paused: false,
});
