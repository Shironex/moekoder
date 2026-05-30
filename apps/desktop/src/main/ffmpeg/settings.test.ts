import { describe, it, expect } from 'vitest';
import {
  resolveHwAccel,
  H264_BALANCED_PRESET,
  HEVC_BALANCED_PRESET,
  AV1_BALANCED_PRESET,
  H264_AMF_BALANCED_PRESET,
  type EncodingSettings,
} from './settings';
import type { GpuVendor } from './gpu-probe';

/**
 * `resolveHwAccel` is the routing seam that mirrors the gpu-probe AMF
 * detection into codec selection — without it, an AMD-only machine whose
 * settings default to `nvenc` would emit `h264_nvenc` and ffmpeg would fail
 * with "unknown encoder". These tests pin the rewrite contract.
 */
describe('resolveHwAccel', () => {
  it('reroutes H.264 nvenc → amf when only amf is available', () => {
    const out = resolveHwAccel(H264_BALANCED_PRESET, ['amf']);
    expect(out.hwAccel).toBe('amf');
    expect(out.codec).toBe('h264');
    // Carries quality knob across so args.ts never sees `-quality undefined`.
    expect((out as { amfQuality?: string }).amfQuality).toBeDefined();
    // p4 → balanced.
    expect((out as { amfQuality?: string }).amfQuality).toBe('balanced');
    // Preserves the user's quality target + container/audio.
    expect(out.cq).toBe(H264_BALANCED_PRESET.cq);
    expect(out.container).toBe(H264_BALANCED_PRESET.container);
    expect(out.audio).toBe(H264_BALANCED_PRESET.audio);
  });

  it('reroutes HEVC nvenc → amf and carries tenBit across', () => {
    const out = resolveHwAccel(HEVC_BALANCED_PRESET, ['amf']);
    expect(out.hwAccel).toBe('amf');
    expect(out.codec).toBe('hevc');
    expect((out as { tenBit?: boolean }).tenBit).toBe(HEVC_BALANCED_PRESET.tenBit);
    expect((out as { amfQuality?: string }).amfQuality).toBe('balanced');
  });

  it('NEVER reroutes AV1 to amf (no av1_amf encoder exists)', () => {
    const out = resolveHwAccel(AV1_BALANCED_PRESET, ['amf']);
    // Unchanged — AV1 falls through to its software path elsewhere.
    expect(out).toBe(AV1_BALANCED_PRESET);
    expect(out.hwAccel).toBe('nvenc');
  });

  it('honours the requested vendor verbatim when it IS available', () => {
    const out = resolveHwAccel(H264_BALANCED_PRESET, ['nvenc', 'amf']);
    expect(out).toBe(H264_BALANCED_PRESET);
    expect(out.hwAccel).toBe('nvenc');
  });

  it('leaves settings untouched when amf is not available either', () => {
    const out = resolveHwAccel(H264_BALANCED_PRESET, ['qsv']);
    expect(out).toBe(H264_BALANCED_PRESET);
  });

  it('treats an empty probe (probe failure) as a no-op', () => {
    const out = resolveHwAccel(H264_BALANCED_PRESET, []);
    expect(out).toBe(H264_BALANCED_PRESET);
  });

  it('does not reroute an already-software path', () => {
    const software: EncodingSettings = {
      codec: 'h264',
      hwAccel: 'libx264',
      rateControl: 'cq',
      cq: 19,
      nvencPreset: 'p4',
      container: 'mp4',
      audio: 'copy',
      tune: 'animation',
    };
    const available: GpuVendor[] = ['amf'];
    const out = resolveHwAccel(software, available);
    expect(out).toBe(software);
  });

  it('does not reroute an already-amf path', () => {
    const out = resolveHwAccel(H264_AMF_BALANCED_PRESET, ['amf']);
    expect(out).toBe(H264_AMF_BALANCED_PRESET);
  });
});
