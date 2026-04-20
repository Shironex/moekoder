import { describe, it, expect } from 'vitest';
import { buildEncodeArgs, type EncodeJob } from './args';
import { BALANCED_PRESET, type EncodingSettings } from './settings';
import { escapeSubtitlePath } from './path-escape';

const VIDEO = 'C:\\in\\ep01.mkv';
const SUB = 'C:\\in\\ep01.ass';
const OUT_MP4 = 'C:\\out\\ep01.mp4';
const OUT_MKV = 'C:\\out\\ep01.mkv';

const withSettings = (overrides: Partial<EncodingSettings>): EncodingSettings => ({
  ...BALANCED_PRESET,
  ...overrides,
});

const baseJob = (overrides: Partial<EncodeJob> = {}): EncodeJob => ({
  videoPath: VIDEO,
  subtitlePath: SUB,
  outputPath: OUT_MP4,
  settings: BALANCED_PRESET,
  ...overrides,
});

describe('buildEncodeArgs — NVENC path', () => {
  it('emits the expected NVENC arg array for the Balanced preset', () => {
    const args = buildEncodeArgs(baseJob());
    const expectedFilter = `subtitles='${escapeSubtitlePath(SUB)}',format=yuv420p`;

    expect(args).toEqual([
      '-i',
      VIDEO,
      '-vf',
      expectedFilter,
      '-c:v',
      'h264_nvenc',
      '-preset',
      'p4',
      '-rc:v',
      'vbr',
      '-cq:v',
      '19',
      '-tune',
      'hq',
      '-spatial_aq',
      '1',
      '-temporal_aq',
      '1',
      '-rc-lookahead',
      '32',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      '-y',
      OUT_MP4,
    ]);
  });

  it('always appends `format=yuv420p` to the filter chain on NVENC', () => {
    const args = buildEncodeArgs(baseJob());
    const vfIdx = args.indexOf('-vf');
    expect(vfIdx).toBeGreaterThan(-1);
    expect(args[vfIdx + 1]).toMatch(/,format=yuv420p$/);
  });
});

describe('buildEncodeArgs — libx264 fallback', () => {
  it('emits libx264 CRF args with the animation tune', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: withSettings({ hwAccel: 'libx264', tune: 'animation' }),
      })
    );
    expect(args).toContain('libx264');
    expect(args).toContain('-crf');
    expect(args).toContain('19');
    expect(args).toContain('-tune');
    expect(args).toContain('animation');
    expect(args).toContain('-preset');
    expect(args).toContain('veryfast');
    // Does NOT include NVENC-specific format=yuv420p.
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).not.toMatch(/format=yuv420p/);
  });

  it('defaults tune to animation when settings.tune is null', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: withSettings({ hwAccel: 'libx264', tune: null }),
      })
    );
    const tuneIdx = args.indexOf('-tune');
    expect(args[tuneIdx + 1]).toBe('animation');
  });
});

describe('buildEncodeArgs — QSV path', () => {
  it('emits h264_qsv with `-global_quality` + `-look_ahead 1`', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: withSettings({ hwAccel: 'qsv' }),
      })
    );
    expect(args).toContain('h264_qsv');
    expect(args).toContain('-global_quality');
    expect(args).toContain('19');
    expect(args).toContain('-look_ahead');
  });
});

describe('buildEncodeArgs — audio handling', () => {
  // The audio fallback lives in FFmpegProcessor.applyAudioFallback — it
  // rewrites `settings.audio` to 'aac-192k' before calling into the arg
  // builder. These tests exercise the pure settings-to-args transform.

  it('stream-copies audio when settings.audio === "copy"', () => {
    const args = buildEncodeArgs(baseJob({ sourceAudioCodec: 'aac' }));
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('copy');
  });

  it('transcodes to AAC 192k when settings.audio === "aac-192k"', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: withSettings({ audio: 'aac-192k' }),
      })
    );
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('aac');
    expect(args).toContain('-b:a');
    expect(args).toContain('192k');
  });

  it('keeps copy for TrueHD when container is MKV (MKV accepts TrueHD)', () => {
    // Processor would not rewrite settings.audio in this case, so builder
    // sees 'copy' verbatim.
    const args = buildEncodeArgs(
      baseJob({
        outputPath: OUT_MKV,
        sourceAudioCodec: 'truehd',
        settings: withSettings({ container: 'mkv' }),
      })
    );
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('copy');
  });
});

describe('buildEncodeArgs — container flags', () => {
  it('appends `-movflags +faststart` for MP4 output', () => {
    const args = buildEncodeArgs(baseJob());
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
  });

  it('does NOT append faststart for MKV output', () => {
    const args = buildEncodeArgs(
      baseJob({
        outputPath: OUT_MKV,
        settings: withSettings({ container: 'mkv' }),
      })
    );
    expect(args).not.toContain('-movflags');
    expect(args).not.toContain('+faststart');
  });
});

describe('buildEncodeArgs — progress + overwrite', () => {
  it('always emits `-progress pipe:1 -nostats`', () => {
    const args = buildEncodeArgs(baseJob());
    expect(args).toContain('-progress');
    const idx = args.indexOf('-progress');
    expect(args[idx + 1]).toBe('pipe:1');
    expect(args).toContain('-nostats');
  });

  it('always emits `-y` immediately before the output path', () => {
    const args = buildEncodeArgs(baseJob());
    const yIdx = args.lastIndexOf('-y');
    expect(yIdx).toBeGreaterThan(-1);
    expect(args[yIdx + 1]).toBe(OUT_MP4);
    expect(yIdx).toBe(args.length - 2);
  });
});

describe('buildEncodeArgs — subtitle path escaping', () => {
  it('runs the subtitle path through escapeSubtitlePath', () => {
    const args = buildEncodeArgs(baseJob());
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).toContain(escapeSubtitlePath(SUB));
    // Sanity-check the raw unescaped path is NOT present in the filter
    // expression — it'd be a bug for the filter-graph parser.
    expect(args[vfIdx + 1]).not.toContain(`${SUB}'`);
  });
});
