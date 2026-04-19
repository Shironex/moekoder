import { describe, it, expect, vi, beforeEach } from 'vitest';

const statfsMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  statfs: (...args: unknown[]) => statfsMock(...args),
}));

import {
  DEFAULT_SAFETY_MARGIN_BYTES,
  checkPreflight,
  estimateOutputBytes,
  getFreeBytes,
} from './disk-space';

beforeEach(() => {
  statfsMock.mockReset();
});

describe('estimateOutputBytes', () => {
  it('computes (kbps * seconds * 1024) / 8 and rounds up', () => {
    // 2500 kbps x 60 s = 2500 * 60 * 1024 / 8 = 19_200_000 bytes
    expect(estimateOutputBytes(60, 2500)).toBe(19_200_000);
  });

  it('returns 0 for non-positive duration or bitrate', () => {
    expect(estimateOutputBytes(0, 2500)).toBe(0);
    expect(estimateOutputBytes(60, 0)).toBe(0);
    expect(estimateOutputBytes(-1, 2500)).toBe(0);
  });

  it('scales linearly with duration', () => {
    const short = estimateOutputBytes(10, 1000);
    const long = estimateOutputBytes(100, 1000);
    expect(long).toBe(short * 10);
  });
});

describe('getFreeBytes', () => {
  it('multiplies bavail * bsize from statfs', async () => {
    statfsMock.mockResolvedValueOnce({ bavail: 1000n, bsize: 4096 });
    // Implementation uses numeric multiplication — supply a numeric bavail
    // so the returned free bytes are a safe number.
    statfsMock.mockReset();
    statfsMock.mockResolvedValueOnce({ bavail: 1000, bsize: 4096 });
    const free = await getFreeBytes('/some/path');
    expect(free).toBe(4_096_000);
    expect(statfsMock).toHaveBeenCalledWith('/some/path');
  });
});

describe('checkPreflight', () => {
  it('returns ok=true when free space easily covers estimate + margin', async () => {
    // 10 GiB free, need ~19.2 MB + 200 MiB margin.
    statfsMock.mockResolvedValueOnce({ bavail: 10 * 1024 * 1024, bsize: 1024 });
    const result = await checkPreflight('/out', 60, 2500);
    expect(result.ok).toBe(true);
    expect(result.shortfallBytes).toBe(0);
    expect(result.estimatedBytes).toBe(19_200_000);
    expect(result.safetyMarginBytes).toBe(DEFAULT_SAFETY_MARGIN_BYTES);
    expect(result.freeBytes).toBe(10 * 1024 * 1024 * 1024);
  });

  it('returns ok=false + shortfall when free space is less than estimate + margin', async () => {
    // 10 MB free, need ~19.2 MB + 200 MiB margin.
    statfsMock.mockResolvedValueOnce({ bavail: 10 * 1024, bsize: 1024 });
    const result = await checkPreflight('/out', 60, 2500);
    expect(result.ok).toBe(false);
    expect(result.shortfallBytes).toBeGreaterThan(0);
    const required = result.estimatedBytes + result.safetyMarginBytes;
    expect(result.shortfallBytes).toBe(required - result.freeBytes);
  });

  it('accepts a custom safety-margin override', async () => {
    statfsMock.mockResolvedValueOnce({ bavail: 30_000_000, bsize: 1 });
    // ~19.2 MB estimate, 1 MB margin -> 20.2 MB needed. 30 MB free → ok.
    const result = await checkPreflight('/out', 60, 2500, 1_000_000);
    expect(result.ok).toBe(true);
    expect(result.safetyMarginBytes).toBe(1_000_000);
  });

  it('is ok at exactly the boundary (free == estimated + margin)', async () => {
    // Required = 19.2 MB + 200 MiB margin = 19_200_000 + 209_715_200 = 228_915_200
    const required = 228_915_200;
    statfsMock.mockResolvedValueOnce({ bavail: required, bsize: 1 });
    const result = await checkPreflight('/out', 60, 2500);
    expect(result.ok).toBe(true);
    expect(result.shortfallBytes).toBe(0);
  });
});
