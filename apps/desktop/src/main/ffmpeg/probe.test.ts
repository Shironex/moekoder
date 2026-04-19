import { describe, it, expect } from 'vitest';
import { normalizeProbeJson } from './probe';

/**
 * A canned ffprobe JSON blob representative of a typical muxed MKV: one
 * video stream, two audio tracks (English + Japanese), two subtitle tracks
 * and one attached font. Wire format mirrors the `-print_format json` shape
 * emitted by ffprobe so this fixture is realistic.
 */
const FIXTURE = {
  format: {
    format_name: 'matroska,webm',
    duration: '1423.456',
    size: '104857600',
    bit_rate: '589234',
  },
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      avg_frame_rate: '24000/1001',
      r_frame_rate: '24000/1001',
    },
    {
      index: 1,
      codec_type: 'audio',
      codec_name: 'aac',
      sample_rate: '48000',
      channels: 2,
      tags: { language: 'eng' },
    },
    {
      index: 2,
      codec_type: 'audio',
      codec_name: 'opus',
      sample_rate: '48000',
      channels: 6,
      tags: { language: 'jpn' },
    },
    {
      index: 3,
      codec_type: 'subtitle',
      codec_name: 'ass',
      tags: { language: 'eng', title: 'English (Signs & Songs)' },
    },
    {
      index: 4,
      codec_type: 'subtitle',
      codec_name: 'srt',
      tags: { language: 'jpn' },
    },
    {
      index: 5,
      codec_type: 'attachment',
      codec_name: 'ttf',
      tags: { filename: 'ComicSans.ttf', mimetype: 'application/x-truetype-font' },
    },
  ],
};

describe('normalizeProbeJson', () => {
  it('extracts top-level format metadata', () => {
    const result = normalizeProbeJson(FIXTURE);
    expect(result.durationSec).toBeCloseTo(1423.456, 3);
    expect(result.format.name).toBe('matroska,webm');
    expect(result.format.size).toBe(104_857_600);
    expect(result.format.bitRate).toBe(589_234);
  });

  it('maps video streams with computed fps', () => {
    const result = normalizeProbeJson(FIXTURE);
    expect(result.videoStreams).toHaveLength(1);
    const [v] = result.videoStreams;
    expect(v.codec).toBe('h264');
    expect(v.width).toBe(1920);
    expect(v.height).toBe(1080);
    // 24000/1001 ≈ 23.976
    expect(v.fps).toBeCloseTo(23.976, 2);
  });

  it('maps audio streams including channel layout + language tag', () => {
    const result = normalizeProbeJson(FIXTURE);
    expect(result.audioStreams).toHaveLength(2);
    expect(result.audioStreams[0]).toEqual({
      index: 1,
      codec: 'aac',
      sampleRate: 48000,
      channels: 2,
      language: 'eng',
    });
    expect(result.audioStreams[1].language).toBe('jpn');
    expect(result.audioStreams[1].channels).toBe(6);
  });

  it('maps subtitle streams including optional title', () => {
    const result = normalizeProbeJson(FIXTURE);
    expect(result.subtitleStreams).toHaveLength(2);
    expect(result.subtitleStreams[0]).toEqual({
      index: 3,
      codec: 'ass',
      language: 'eng',
      title: 'English (Signs & Songs)',
    });
    expect(result.subtitleStreams[1].title).toBeUndefined();
  });

  it('maps attachments with filename + mimetype tags', () => {
    const result = normalizeProbeJson(FIXTURE);
    expect(result.attachments).toEqual([
      {
        index: 5,
        filename: 'ComicSans.ttf',
        mimeType: 'application/x-truetype-font',
      },
    ]);
  });

  it('gracefully handles an empty ffprobe response', () => {
    const result = normalizeProbeJson({});
    expect(result).toEqual({
      durationSec: 0,
      format: { name: 'unknown', size: 0, bitRate: 0 },
      videoStreams: [],
      audioStreams: [],
      subtitleStreams: [],
      attachments: [],
    });
  });

  it('falls back from avg_frame_rate to r_frame_rate when avg is 0/0', () => {
    const result = normalizeProbeJson({
      streams: [
        {
          index: 0,
          codec_type: 'video',
          codec_name: 'hevc',
          width: 3840,
          height: 2160,
          avg_frame_rate: '0/0',
          r_frame_rate: '60/1',
        },
      ],
    });
    expect(result.videoStreams[0].fps).toBe(60);
  });
});
