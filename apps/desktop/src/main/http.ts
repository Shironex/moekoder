import { createMainLogger } from './logger';
import { MinIntervalGate } from './utils/min-interval-gate';
import { downloadFile } from './utils/net-download';

const log = createMainLogger('http');

/**
 * Minimum spacing (ms) between outbound requests per hostname. Hosts not
 * listed here are ungated. Seeded with the two GitHub hosts we pull BtbN
 * FFmpeg builds from + `www.gyan.dev` (small host — be polite).
 */
const HTTP_HOST_GATES: Record<string, number> = {
  'github.com': 500,
  'objects.githubusercontent.com': 500,
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
 * Gated `fetch`. Respects the per-host minimum spacing before issuing the
 * request — callers still handle the response themselves.
 */
export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  return runGated(url, () => fetch(url, init));
}

/**
 * Gated file download. Composes `downloadFile` with the per-host gate so
 * sequential downloads from the same CDN space themselves correctly.
 */
export async function downloadToFile(
  url: string,
  dest: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  log.debug(`download ${url} -> ${dest}`);
  await runGated(url, () => downloadFile(url, dest, onProgress));
}

/**
 * Test-only: clear all gate state so each test starts from a fresh clock.
 * Exported unconditionally — callers outside tests have no reason to touch it.
 */
export function __resetGatesForTests(): void {
  gates.clear();
}
