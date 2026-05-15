import { describe, it, expect } from 'vitest';
import { buildEncodeArgs, type EncodeJob } from './args';
import {
  AV1_BALANCED_PRESET,
  BALANCED_PRESET,
  HEVC_BALANCED_PRESET,
  type EncodingSettings,
} from './settings';
import { escapeLibassPath } from './path-escape';

const VIDEO = 'C:\\in\\ep01.mkv';
const SUB = 'C:\\in\\ep01.ass';
const OUT_MP4 = 'C:\\out\\ep01.mp4';
const OUT_MKV = 'C:\\out\\ep01.mkv';

/**
 * Spread the H.264 Balanced default with an override patch. The override
 * type is a record of arbitrary fields because spreading a discriminated
 * union loses discriminant linkage in TS — the cast to `EncodingSettings`
 * at the boundary is safe here because the test author knows the
 * resulting blob is a legal union member.
 */
const withSettings = (overrides: Record<string, unknown>): EncodingSettings =>
  ({ ...BALANCED_PRESET, ...overrides }) as EncodingSettings;

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
    const expectedFilter = `subtitles='${escapeLibassPath(SUB)}',format=yuv420p`;

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
  it('runs the subtitle path through escapeLibassPath', () => {
    const args = buildEncodeArgs(baseJob());
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).toContain(escapeLibassPath(SUB));
    // Sanity-check the raw unescaped path is NOT present in the filter
    // expression — it'd be a bug for the filter-graph parser.
    expect(args[vfIdx + 1]).not.toContain(`${SUB}'`);
  });
});

// -----------------------------------------------------------------------------
// v0.4.0 — codec branches: HEVC + AV1.
// -----------------------------------------------------------------------------

describe('buildEncodeArgs — HEVC NVENC (10-bit main10)', () => {
  it('emits the expected hevc_nvenc arg array for the Balanced preset', () => {
    const args = buildEncodeArgs(baseJob({ settings: HEVC_BALANCED_PRESET }));
    const expectedFilter = `subtitles='${escapeLibassPath(SUB)}',format=yuv420p10le`;

    expect(args).toEqual([
      '-i',
      VIDEO,
      '-vf',
      expectedFilter,
      '-c:v',
      'hevc_nvenc',
      '-preset',
      'p4',
      '-rc:v',
      'vbr',
      '-cq:v',
      '22',
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
      '-tag:v',
      'hvc1',
      '-progress',
      'pipe:1',
      '-nostats',
      '-y',
      OUT_MP4,
    ]);
  });

  it('falls back to 8-bit yuv420p when tenBit is false', () => {
    const args = buildEncodeArgs(baseJob({ settings: { ...HEVC_BALANCED_PRESET, tenBit: false } }));
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).toMatch(/format=yuv420p$/);
    expect(args[vfIdx + 1]).not.toContain('format=yuv420p10le');
  });

  it('skips the `-tag:v hvc1` tag for MKV output', () => {
    const args = buildEncodeArgs(
      baseJob({
        outputPath: OUT_MKV,
        settings: { ...HEVC_BALANCED_PRESET, container: 'mkv' },
      })
    );
    expect(args).not.toContain('-tag:v');
    expect(args).not.toContain('hvc1');
  });
});

describe('buildEncodeArgs — libx265 software', () => {
  it('emits libx265 with CRF + animation tune + libx265 preset', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: {
          codec: 'hevc',
          hwAccel: 'libx265',
          rateControl: 'cq',
          cq: 22,
          libx265Preset: 'medium',
          container: 'mp4',
          audio: 'copy',
          tune: 'animation',
        },
      })
    );
    expect(args).toContain('libx265');
    expect(args).toContain('-crf');
    expect(args).toContain('22');
    expect(args).toContain('-preset');
    expect(args).toContain('medium');
    expect(args).toContain('-tune');
    expect(args).toContain('animation');
    // libx265 software ingests source pixel format — no `format=` filter.
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).not.toMatch(/format=/);
    // HEVC + MP4 still picks up the hvc1 muxer tag.
    expect(args).toContain('-tag:v');
    expect(args).toContain('hvc1');
  });
});

describe('buildEncodeArgs — AV1 NVENC', () => {
  it('emits av1_nvenc with the Balanced preset', () => {
    const args = buildEncodeArgs(baseJob({ settings: AV1_BALANCED_PRESET }));
    const expectedFilter = `subtitles='${escapeLibassPath(SUB)}',format=yuv420p10le`;

    expect(args).toEqual([
      '-i',
      VIDEO,
      '-vf',
      expectedFilter,
      '-c:v',
      'av1_nvenc',
      '-preset',
      'p4',
      '-rc:v',
      'vbr',
      '-cq:v',
      '28',
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

  it('does NOT emit the hvc1 tag for AV1 (MP4 muxer picks `av01` itself)', () => {
    const args = buildEncodeArgs(baseJob({ settings: AV1_BALANCED_PRESET }));
    expect(args).not.toContain('-tag:v');
  });
});

describe('buildEncodeArgs — libsvtav1 software', () => {
  it('emits libsvtav1 with integer preset + CRF mode', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: {
          codec: 'av1',
          hwAccel: 'libsvtav1',
          rateControl: 'cq',
          cq: 30,
          svtPreset: 8,
          container: 'mkv',
          audio: 'copy',
        },
        outputPath: OUT_MKV,
      })
    );
    expect(args).toContain('libsvtav1');
    expect(args).toContain('-preset');
    // Integer preset, stringified.
    const presetIdx = args.indexOf('-preset');
    expect(args[presetIdx + 1]).toBe('8');
    expect(args).toContain('-crf');
    expect(args).toContain('30');
    // libsvtav1 software ingests source pixel format — no `format=` filter.
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).not.toMatch(/format=/);
  });

  it('rejects no NVENC tune flags on the libsvtav1 path', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: {
          codec: 'av1',
          hwAccel: 'libsvtav1',
          rateControl: 'cq',
          cq: 30,
          svtPreset: 8,
          container: 'mkv',
          audio: 'copy',
        },
        outputPath: OUT_MKV,
      })
    );
    // libsvtav1 has its own `-tune` namespace; v0.4 doesn't expose it yet.
    expect(args).not.toContain('-tune');
    expect(args).not.toContain('-spatial_aq');
  });
});

// -----------------------------------------------------------------------------
// v0.5.0 — MKV embedded font extraction: subtitles filter learns `:fontsdir=`.
// -----------------------------------------------------------------------------

describe('buildEncodeArgs — fontsdir (v0.5.0)', () => {
  const FONTS_DIR = 'C:\\Users\\u\\AppData\\Local\\Temp\\mkfont-abc123';

  it('appends `:fontsdir=<escaped>` to the subtitles filter when fontsDir is set', () => {
    const args = buildEncodeArgs(baseJob({ fontsDir: FONTS_DIR }));
    const vfIdx = args.indexOf('-vf');
    const vf = args[vfIdx + 1]!;
    expect(vf).toContain(`subtitles='${escapeLibassPath(SUB)}'`);
    expect(vf).toContain(`:fontsdir='${escapeLibassPath(FONTS_DIR)}'`);
    // Order matters: fontsdir must follow the subtitles token (filter-graph
    // option syntax), not appear after the pixel-format normaliser.
    expect(vf.indexOf(':fontsdir=')).toBeLessThan(vf.indexOf(',format='));
  });

  it('emits the v0.4 NVENC arg array byte-for-byte when fontsDir is absent', () => {
    // Regression lock — every existing v0.4 caller passes no fontsDir and
    // MUST get the exact same filter string. If this test ever drifts, the
    // v0.4 → v0.5 upgrade silently changed user behaviour.
    const v04 = buildEncodeArgs(baseJob());
    const v05 = buildEncodeArgs(baseJob({ fontsDir: undefined }));
    expect(v05).toEqual(v04);
    const vfIdx = v05.indexOf('-vf');
    expect(v05[vfIdx + 1]).not.toContain('fontsdir');
  });

  it('keeps the NVENC pixel-format normaliser after the fontsdir token', () => {
    const args = buildEncodeArgs(baseJob({ fontsDir: FONTS_DIR }));
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).toMatch(/:fontsdir='[^']+',format=yuv420p$/);
  });

  it('still emits fontsdir on the libx264 software path', () => {
    const args = buildEncodeArgs(
      baseJob({
        settings: withSettings({ hwAccel: 'libx264', tune: 'animation' }),
        fontsDir: FONTS_DIR,
      })
    );
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).toContain(':fontsdir=');
    // libx264 doesn't append a `format=` filter, so the chain ends at the
    // closing quote of the fontsdir option.
    expect(args[vfIdx + 1]).toMatch(/:fontsdir='[^']+'$/);
  });
});

describe('buildEncodeArgs — clip window (benchmark mode)', () => {
  it('emits `-ss <start> -t <duration>` before `-i` when clipWindow is set', () => {
    const args = buildEncodeArgs(baseJob({ clipWindow: { startSec: 0, durationSec: 10 } }));
    expect(args[0]).toBe('-ss');
    expect(args[1]).toBe('0');
    expect(args[2]).toBe('-t');
    expect(args[3]).toBe('10');
    expect(args[4]).toBe('-i');
  });

  it('does NOT emit `-ss` / `-t` when clipWindow is undefined', () => {
    const args = buildEncodeArgs(baseJob());
    expect(args).not.toContain('-ss');
    // `-t` does not appear in the standard NVENC arg set.
    expect(args).not.toContain('-t');
    expect(args[0]).toBe('-i');
  });
});
