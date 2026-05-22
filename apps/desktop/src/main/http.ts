import { createMainLogger } from './logger';
import { MinIntervalGate } from './utils/min-interval-gate';
import { downloadFile, type DownloadProgress } from './utils/net-download';

export type { DownloadProgress };

const log = createMainLogger('http');

/**
 * Minimum spacing (ms) between outbound requests per hostname. Hosts not
 * listed here are ungated. Seeded with the two GitHub hosts we pull BtbN
 * FFmpeg builds from + `www.gyan.dev` (small host — be polite). `api.github.com`
 * is gated more conservatively: unauthenticated it allows only 60 req/hr/IP, so
 * spacing keeps a single install's resolution calls well clear of that ceiling.
 */
const HTTP_HOST_GATES: Record<string, number> = {
  'github.com': 500,
  'objects.githubusercontent.com': 500,
  'api.github.com': 1000,
  'www.gyan.dev': 2000,
};

const gates = new Map<string, MinIntervalGate>();

function gateFor(hostname: string): MinIntervalGate | null {
  const interval = HTTP_HOST_GATES[hostname];
  if (interval === undefined) return null;
  let gate = gates.get(hostname);
  if (!gate) {
    gate = new MinIntervalGate({ minIntervalMs: interval });
    gates.set(hostname, gate);
  }
  return gate;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Run `op` through the per-host gate, or directly if the host is ungated.
 * Exposes the gate indirection so every outbound call — `fetch`, downloads,
 * future probes — shares the same rate-limit state keyed by hostname.
 */
function runGated<T>(url: string, op: () => Promise<T>): Promise<T> {
  const hostname = hostnameOf(url);
  if (!hostname) return op();
  const gate = gateFor(hostname);
  if (!gate) return op();
  return gate.run(op);
}

/**
 * Gated file download. Composes `downloadFile` with the per-host gate so
 * sequential downloads from the same CDN space themselves correctly.
 */
export async function downloadToFile(
  url: string,
  dest: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  log.debug(`download ${url} -> ${dest}`);
  await runGated(url, () => downloadFile(url, dest, onProgress));
}

/**
 * Gated JSON GET. Runs through the same per-host gate as `downloadToFile` so
 * API probes and downloads share one rate-limit clock per hostname. Sends the
 * headers the GitHub REST API requires (`User-Agent` is mandatory; `Accept`
 * pins the v3 media type). Throws a clear, host-prefixed error on any non-2xx
 * so callers can surface an actionable message rather than parsing an HTML
 * error page as JSON.
 */
export async function fetchGitHubJson<T>(url: string): Promise<T> {
  log.debug(`fetchGitHubJson ${url}`);
  return runGated(url, async () => {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'moekoder',
        Accept: 'application/vnd.github+json',
      },
    });
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status} (${response.statusText}): ${url}`
      );
    }
    return (await response.json()) as T;
  });
}

/**
 * Test-only: clear all gate state so each test starts from a fresh clock.
 * Exported unconditionally — callers outside tests have no reason to touch it.
 */
export function __resetGatesForTests(): void {
  gates.clear();
}
