import { spawn } from 'node:child_process';
import { createMainLogger } from '../logger';
import { IpcError } from '../ipc/errors';
import { getFfmpegPath } from '../utils/bin-paths';
import { isInstalled } from './manager';

const log = createMainLogger('ffmpeg/gpu-probe');

/** 3-second hard cap — `-encoders` should finish in well under 1s. */
const GPU_PROBE_TIMEOUT_MS = 3_000;

export type GpuVendor = 'nvenc' | 'qsv' | 'amf' | 'videotoolbox';

/**
 * Patterns we grep for in `ffmpeg -encoders` output. One pattern per vendor,
 * matching the H.264 / HEVC / AV1 encoder names ffmpeg advertises when the
 * relevant runtime + driver combination is available. Grep-only probe — a
 * 1-frame encode verification lands in Phase 3 once we can build encode
 * argument lists.
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

  return { available, details };
}

/**
 * Run `ffmpeg -encoders` and classify the available hardware encoder
 * families. Throws `IpcError('UNAVAILABLE')` when the ffmpeg binary isn't
 * installed — the caller is expected to gate this behind `isInstalled`
 * anyway, but the explicit error keeps the path safe.
 */
export async function probeGpu(): Promise<GpuProbeResult> {
  if (!(await isInstalled())) {
    throw new IpcError('UNAVAILABLE', 'probeGpu(): ffmpeg binary is not installed');
  }

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(getFfmpegPath(), ['-hide_banner', '-encoders'], {
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

    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf-8');
    });
    child.stderr.on('data', (c: Buffer) => {
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

  const result = parseEncoderList(output);
  log.info(`[gpu-probe] available vendors: ${result.available.join(', ') || '(none)'}`);
  return result;
}
