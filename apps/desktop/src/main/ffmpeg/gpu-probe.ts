import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import Store from 'electron-store';
import { createMainLogger } from '../logger';
import { IpcError } from '../ipc/errors';
import { getFfmpegPath } from '../utils/bin-paths';
import { isInstalled } from './manager';

const log = createMainLogger('ffmpeg/gpu-probe');

/** 3-second hard cap — `-encoders` should finish in well under 1s. */
const GPU_PROBE_TIMEOUT_MS = 3_000;

/**
 * Per-encoder verification timeout. A 1-frame lavfi encode finishes in well
 * under 1s on working hardware; 5s is a generous margin for loaded systems.
 * A test-encode that exceeds this is treated as a broken encoder and filtered.
 */
const VERIFY_TIMEOUT_MS = 5_000;

/** electron-store key the verified probe result is cached under. */
const GPU_PROBE_CACHE_KEY = 'gpuProbeCache';
/** Bump when the verification logic or result shape changes to invalidate caches. */
const GPU_PROBE_CACHE_VERSION = 1;
/** Cached results older than this are re-probed (drivers / hardware may change). */
const GPU_PROBE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export type GpuVendor = 'nvenc' | 'qsv' | 'amf' | 'videotoolbox';

/** Spawn signature, narrowed to what the probe needs. Injectable for tests. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => ChildProcess;

/**
 * Patterns we grep for in `ffmpeg -encoders` output. One pattern per vendor,
 * matching the H.264 / HEVC / AV1 encoder names ffmpeg advertises when the
 * relevant runtime + driver combination is available. Grep matching only
 * decides which encoders are *candidates*; each candidate is then confirmed
 * with a 1-frame test-encode (see `verifyEncoderWorks`) before being
 * advertised as available.
 */
const VENDOR_PATTERNS: Record<GpuVendor, RegExp> = {
  nvenc: /\b(h264_nvenc|hevc_nvenc|av1_nvenc)\b/g,
  qsv: /\b(h264_qsv|hevc_qsv)\b/g,
  amf: /\b(h264_amf|hevc_amf)\b/g,
  videotoolbox: /\b(h264_videotoolbox|hevc_videotoolbox)\b/g,
};

export interface GpuProbeResult {
  available: GpuVendor[];
  details: Record<GpuVendor, { encoders: string[] } | null>;
  /**
   * `true` once every advertised encoder has passed a runtime 1-frame
   * test-encode. Lets consumers distinguish a verified result from a raw
   * grep-only result should verification ever be made optional.
   */
  verified: boolean;
}

/** Persisted cache envelope. */
interface GpuProbeCacheEnvelope {
  version: number;
  cachedAt: number;
  result: GpuProbeResult;
}

/**
 * Injectable dependencies for `probeGpu`. All optional — production callers
 * pass nothing and get the real ffmpeg binary, real spawn, and electron-store
 * cache. Tests inject a mock spawn and an in-memory cache.
 */
export interface ProbeGpuOptions {
  spawn?: SpawnFn;
  ffmpegPath?: string;
  /** Per-encoder verification timeout in ms. */
  verifyTimeoutMs?: number;
  /** Read the persisted cache envelope; return `undefined` to force a re-probe. */
  cacheGet?: () => GpuProbeCacheEnvelope | undefined;
  /** Persist the verified result envelope. */
  cacheSet?: (envelope: GpuProbeCacheEnvelope) => void;
  /** Skip the cache entirely (always probe + verify). */
  bypassCache?: boolean;
  /** Clock injection for deterministic TTL tests. */
  now?: () => number;
}

/** Options for a single-encoder verification. */
export interface VerifyEncoderOptions {
  spawn?: SpawnFn;
  ffmpegPath?: string;
  timeoutMs?: number;
}

/** Exported for direct unit testing against canned `ffmpeg -encoders` output. */
export function parseEncoderList(output: string): GpuProbeResult {
  const details: GpuProbeResult['details'] = {
    nvenc: null,
    qsv: null,
    amf: null,
    videotoolbox: null,
  };
  const available: GpuVendor[] = [];

  for (const vendor of Object.keys(VENDOR_PATTERNS) as GpuVendor[]) {
    const matches = output.matchAll(VENDOR_PATTERNS[vendor]);
    const encoders = Array.from(new Set([...matches].map(m => m[1]))).sort();
    if (encoders.length > 0) {
      details[vendor] = { encoders };
      available.push(vendor);
    }
  }

  return { available, details, verified: false };
}

/**
 * Run a minimal 1-frame test-encode to confirm an encoder actually works at
 * runtime — ffmpeg advertising an encoder in `-encoders` does not guarantee
 * the driver / runtime combo can initialise it. Generates the input in-memory
 * via lavfi and discards output through the null muxer, so there are no temp
 * files and no `/dev/null`-vs-`NUL` platform branch.
 *
 * Resolves `true` only on a clean (code 0) exit. Any failure — non-zero exit,
 * spawn error, or timeout — resolves `false` so the caller filters the encoder
 * rather than crashing. Never rejects.
 */
export async function verifyEncoderWorks(
  encoder: string,
  options: VerifyEncoderOptions = {}
): Promise<boolean> {
  const spawn = options.spawn ?? (nodeSpawn as SpawnFn);
  const ffmpegPath = options.ffmpegPath ?? getFfmpegPath();
  const timeoutMs = options.timeoutMs ?? VERIFY_TIMEOUT_MS;

  const args = [
    '-hide_banner',
    '-nostdin',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=64x64:rate=1',
    '-frames:v',
    '1',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    encoder,
    '-f',
    'null',
    '-',
  ];

  return new Promise<boolean>(resolve => {
    let child: ChildProcess;
    try {
      child = spawn(ffmpegPath, args, { windowsHide: true });
    } catch (err) {
      log.warn(`[gpu-probe] verify spawn failed for ${encoder}: ${String(err)}`);
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      log.warn(`[gpu-probe] verify timed out for ${encoder} after ${timeoutMs}ms`);
      // SIGTERM first; fall back to SIGKILL if the process ignores it.
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }, 500).unref?.();
      finish(false);
    }, timeoutMs);
    timer.unref?.();

    // Drain pipes so a chatty encoder can't fill the buffer and stall.
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});

    child.on('error', err => {
      log.warn(`[gpu-probe] verify process error for ${encoder}: ${String(err)}`);
      finish(false);
    });
    child.on('close', code => finish(code === 0));
  });
}

/**
 * Verify every candidate encoder concurrently and drop the ones that fail.
 * Vendors left with zero working encoders are pruned from `available` and
 * their `details` entry set to `null`. Verification runs in parallel so total
 * added latency is ~one timeout regardless of encoder count.
 */
async function verifyAndFilter(
  base: GpuProbeResult,
  verifyOptions: VerifyEncoderOptions
): Promise<GpuProbeResult> {
  const details: GpuProbeResult['details'] = {
    nvenc: null,
    qsv: null,
    amf: null,
    videotoolbox: null,
  };

  // Flatten to (vendor, encoder) pairs and verify all at once.
  const pairs: { vendor: GpuVendor; encoder: string }[] = [];
  for (const vendor of base.available) {
    for (const encoder of base.details[vendor]?.encoders ?? []) {
      pairs.push({ vendor, encoder });
    }
  }

  const outcomes = await Promise.allSettled(
    pairs.map(p => verifyEncoderWorks(p.encoder, verifyOptions))
  );

  const working: Record<GpuVendor, string[]> = {
    nvenc: [],
    qsv: [],
    amf: [],
    videotoolbox: [],
  };
  pairs.forEach((p, i) => {
    const o = outcomes[i];
    if (o.status === 'fulfilled' && o.value === true) {
      working[p.vendor].push(p.encoder);
    } else {
      log.info(`[gpu-probe] dropping non-functional encoder: ${p.encoder}`);
    }
  });

  const available: GpuVendor[] = [];
  for (const vendor of base.available) {
    const encoders = working[vendor];
    if (encoders.length > 0) {
      details[vendor] = { encoders: encoders.sort() };
      available.push(vendor);
    }
  }

  return { available, details, verified: true };
}

/**
 * Lazily-created electron-store instance for the probe cache. Construction is
 * deferred because `new Store()` calls `app.getPath('userData')`, which throws
 * outside the Electron runtime — importing this module (e.g. in unit tests)
 * must stay side-effect free. Tests bypass this entirely via injected
 * `cacheGet`/`cacheSet` or `bypassCache`.
 */
let cacheStore: Store<Record<string, unknown>> | null = null;
function getCacheStore(): Store<Record<string, unknown>> {
  if (!cacheStore) {
    cacheStore = new Store<Record<string, unknown>>({ name: 'gpu-probe-cache' });
  }
  return cacheStore;
}

function defaultCacheGet(): GpuProbeCacheEnvelope | undefined {
  try {
    const raw = getCacheStore().get(GPU_PROBE_CACHE_KEY);
    return (raw as GpuProbeCacheEnvelope | undefined) ?? undefined;
  } catch (err) {
    log.warn(`[gpu-probe] cache read failed: ${String(err)}`);
    return undefined;
  }
}

function defaultCacheSet(envelope: GpuProbeCacheEnvelope): void {
  try {
    getCacheStore().set(GPU_PROBE_CACHE_KEY, envelope);
  } catch (err) {
    log.warn(`[gpu-probe] cache write failed: ${String(err)}`);
  }
}

/**
 * Run `ffmpeg -encoders` and classify the available hardware encoder
 * families. Throws `IpcError('UNAVAILABLE')` when the ffmpeg binary isn't
 * installed — the caller is expected to gate this behind `isInstalled`
 * anyway, but the explicit error keeps the path safe.
 */
export async function probeGpu(options: ProbeGpuOptions = {}): Promise<GpuProbeResult> {
  if (!(await isInstalled())) {
    throw new IpcError('UNAVAILABLE', 'probeGpu(): ffmpeg binary is not installed');
  }

  const spawn = options.spawn ?? (nodeSpawn as SpawnFn);
  const ffmpegPath = options.ffmpegPath ?? getFfmpegPath();
  const now = options.now ?? Date.now;
  const cacheGet = options.cacheGet ?? defaultCacheGet;
  const cacheSet = options.cacheSet ?? defaultCacheSet;

  if (!options.bypassCache) {
    const cached = cacheGet();
    if (
      cached &&
      cached.version === GPU_PROBE_CACHE_VERSION &&
      now() - cached.cachedAt < GPU_PROBE_CACHE_TTL_MS
    ) {
      log.info(`[gpu-probe] cache hit: ${cached.result.available.join(', ') || '(none)'}`);
      return cached.result;
    }
  }

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-encoders'], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`ffmpeg -encoders timed out after ${GPU_PROBE_TIMEOUT_MS}ms`));
    }, GPU_PROBE_TIMEOUT_MS);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();

    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf-8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf-8');
    });

    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffmpeg -encoders exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
  });

  const candidates = parseEncoderList(output);
  log.info(`[gpu-probe] candidate vendors: ${candidates.available.join(', ') || '(none)'}`);

  const result = await verifyAndFilter(candidates, {
    spawn,
    ffmpegPath,
    timeoutMs: options.verifyTimeoutMs ?? VERIFY_TIMEOUT_MS,
  });
  log.info(`[gpu-probe] verified vendors: ${result.available.join(', ') || '(none)'}`);

  if (!options.bypassCache) {
    cacheSet({ version: GPU_PROBE_CACHE_VERSION, cachedAt: now(), result });
  }

  return result;
}
