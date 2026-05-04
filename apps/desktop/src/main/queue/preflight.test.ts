import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
}));

vi.mock('../logger', () => ({
  createMainLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  }),
}));

import type { QueueItem } from '@moekoder/shared';
import { preflightQueue } from './preflight';
import { isIpcError } from '../ipc/errors';

const baseItem: QueueItem = {
  id: 'i1',
  videoPath: '/v/a.mkv',
  videoName: 'a.mkv',
  subtitlePath: '/s/a.ass',
  subtitleName: 'a.ass',
  outputPath: '/out/dirA/a.mp4',
  status: 'wait',
  progress: null,
  attempts: 0,
  lastError: null,
  addedAt: 0,
  startedAt: null,
  completedAt: null,
  logs: [],
};

const makeItem = (override: Partial<QueueItem>): QueueItem => ({ ...baseItem, ...override });

describe('preflightQueue', () => {
  it('no-ops when no items are waiting', async () => {
    const probeDuration = vi.fn(async () => 60);
    const getFreeBytes = vi.fn(async () => 0);
    const out = await preflightQueue([], 2500, 0, { probeDuration, getFreeBytes });
    expect(out.itemsConsidered).toBe(0);
    expect(out.directories).toEqual([]);
    expect(out.shortfalls).toEqual([]);
    expect(probeDuration).not.toHaveBeenCalled();
    expect(getFreeBytes).not.toHaveBeenCalled();
  });

  it('counts only `wait` items — done / active / error / cancelled are skipped', async () => {
    const probeDuration = vi.fn(async () => 60);
    const getFreeBytes = vi.fn(async () => Number.MAX_SAFE_INTEGER);
    const items = [
      makeItem({ id: '1', status: 'wait', outputPath: '/dir/a.mp4' }),
      makeItem({ id: '2', status: 'done', outputPath: '/dir/b.mp4' }),
      makeItem({ id: '3', status: 'active', outputPath: '/dir/c.mp4' }),
      makeItem({ id: '4', status: 'error', outputPath: '/dir/d.mp4' }),
      makeItem({ id: '5', status: 'cancelled', outputPath: '/dir/e.mp4' }),
    ];
    const out = await preflightQueue(items, 2500, 0, { probeDuration, getFreeBytes });
    expect(out.itemsConsidered).toBe(1);
    expect(probeDuration).toHaveBeenCalledTimes(1);
    expect(getFreeBytes).toHaveBeenCalledTimes(1);
  });

  it('groups by output dir and resolves on sufficient space', async () => {
    const probeDuration = vi.fn(async () => 60);
    const getFreeBytes = vi.fn(async () => 10 * 1024 * 1024 * 1024); // 10 GiB free everywhere
    const items = [
      makeItem({ id: '1', outputPath: '/dirA/a.mp4' }),
      makeItem({ id: '2', outputPath: '/dirA/b.mp4' }),
      makeItem({ id: '3', outputPath: '/dirB/c.mp4' }),
    ];
    const out = await preflightQueue(items, 2500, 0, { probeDuration, getFreeBytes });
    // Two unique dirs → exactly two free-space probes.
    expect(getFreeBytes).toHaveBeenCalledTimes(2);
    expect(out.directories).toHaveLength(2);
    expect(out.shortfalls).toEqual([]);
    expect(out.itemsConsidered).toBe(3);

    // dirA aggregate should be 2x the per-item bytes.
    const dirA = out.directories.find(d => d.dir === '/dirA')!;
    const dirB = out.directories.find(d => d.dir === '/dirB')!;
    expect(dirA.requiredBytes).toBe(2 * dirB.requiredBytes);
  });

  it('throws IpcError(UNAVAILABLE) listing every short directory', async () => {
    const probeDuration = vi.fn(async () => 60);
    const getFreeBytes = vi.fn(async (dir: string) => {
      if (dir === '/dirShort') return 0; // no free bytes
      return 10 * 1024 * 1024 * 1024;
    });
    const items = [
      makeItem({ id: '1', outputPath: '/dirOk/a.mp4' }),
      makeItem({ id: '2', outputPath: '/dirShort/b.mp4' }),
    ];
    await expect(preflightQueue(items, 2500, 0, { probeDuration, getFreeBytes })).rejects.toSatisfy(
      (err: unknown) => {
        if (!isIpcError(err)) return false;
        if (err.code !== 'UNAVAILABLE') return false;
        const details = err.details as { shortfalls: Array<{ dir: string }> } | undefined;
        return details?.shortfalls.some(s => s.dir === '/dirShort') ?? false;
      }
    );
  });

  it('treats a probeDuration failure as zero bytes — does not throw, defers to per-item preflight', async () => {
    const probeDuration = vi.fn(async (videoPath: string) => {
      if (videoPath === '/bad.mkv') throw new Error('probe-failed');
      return 60;
    });
    const getFreeBytes = vi.fn(async () => 10 * 1024 * 1024 * 1024);
    const items = [
      makeItem({ id: '1', videoPath: '/good.mkv', outputPath: '/dir/a.mp4' }),
      makeItem({ id: '2', videoPath: '/bad.mkv', outputPath: '/dir/b.mp4' }),
    ];
    const out = await preflightQueue(items, 2500, 0, { probeDuration, getFreeBytes });
    expect(out.shortfalls).toEqual([]);
    expect(out.itemsConsidered).toBe(2);
  });

  it('reports a shortfall when getFreeBytes itself throws (e.g. dir does not exist)', async () => {
    const probeDuration = vi.fn(async () => 60);
    const getFreeBytes = vi.fn(async () => {
      throw new Error('ENOENT');
    });
    const items = [makeItem({ id: '1', outputPath: '/missing/a.mp4' })];
    await expect(preflightQueue(items, 2500, 0, { probeDuration, getFreeBytes })).rejects.toSatisfy(
      (err: unknown) => isIpcError(err) && err.code === 'UNAVAILABLE'
    );
  });
});
