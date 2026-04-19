import { describe, it, expect } from 'vitest';
import { parseEncoderList } from './gpu-probe';

/**
 * Canned fragments from real `ffmpeg -encoders` output. Each fragment has
 * the leading "V..." / "A..." / "S..." flag column so we can sanity-check
 * that our word-boundary patterns don't accidentally trip on substrings.
 */
const NVENC_ENCODERS = `
 V..... h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V..... hevc_nvenc           NVIDIA NVENC HEVC encoder (codec hevc)
 V..... av1_nvenc            NVIDIA NVENC AV1 encoder (codec av1)
`;

const QSV_ENCODERS = `
 V..... h264_qsv             H264 video (Intel Quick Sync Video acceleration) (codec h264)
 V..... hevc_qsv             HEVC (Intel Quick Sync Video acceleration) (codec hevc)
`;

const AMF_ENCODERS = `
 V..... h264_amf             AMD AMF H.264 Encoder (codec h264)
 V..... hevc_amf             AMD AMF HEVC encoder (codec hevc)
`;

const VIDEOTOOLBOX_ENCODERS = `
 V..... h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)
 V..... hevc_videotoolbox    VideoToolbox HEVC Encoder (codec hevc)
`;

const NO_HW_BANNER = `
Encoders:
 V..... = Video
 A..... = Audio
 V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V..... libx265              libx265 H.265 / HEVC (codec hevc)
 A..... aac                  AAC (Advanced Audio Coding)
`;

describe('parseEncoderList', () => {
  it('detects NVENC with all three H.264/HEVC/AV1 encoders', () => {
    const result = parseEncoderList(NVENC_ENCODERS);
    expect(result.available).toEqual(['nvenc']);
    expect(result.details.nvenc).toEqual({
      encoders: ['av1_nvenc', 'h264_nvenc', 'hevc_nvenc'],
    });
    expect(result.details.qsv).toBeNull();
    expect(result.details.amf).toBeNull();
    expect(result.details.videotoolbox).toBeNull();
  });

  it('detects Intel QSV', () => {
    const result = parseEncoderList(QSV_ENCODERS);
    expect(result.available).toEqual(['qsv']);
    expect(result.details.qsv?.encoders).toEqual(['h264_qsv', 'hevc_qsv']);
  });

  it('detects AMD AMF', () => {
    const result = parseEncoderList(AMF_ENCODERS);
    expect(result.available).toEqual(['amf']);
    expect(result.details.amf?.encoders).toEqual(['h264_amf', 'hevc_amf']);
  });

  it('detects macOS VideoToolbox', () => {
    const result = parseEncoderList(VIDEOTOOLBOX_ENCODERS);
    expect(result.available).toEqual(['videotoolbox']);
    expect(result.details.videotoolbox?.encoders).toEqual([
      'h264_videotoolbox',
      'hevc_videotoolbox',
    ]);
  });

  it('returns no vendors when only software encoders are listed', () => {
    const result = parseEncoderList(NO_HW_BANNER);
    expect(result.available).toEqual([]);
    expect(result.details.nvenc).toBeNull();
    expect(result.details.qsv).toBeNull();
    expect(result.details.amf).toBeNull();
    expect(result.details.videotoolbox).toBeNull();
  });

  it('detects multiple vendors in combined output', () => {
    const combined = NVENC_ENCODERS + QSV_ENCODERS + AMF_ENCODERS;
    const result = parseEncoderList(combined);
    expect(result.available.sort()).toEqual(['amf', 'nvenc', 'qsv']);
    expect(result.details.videotoolbox).toBeNull();
  });

  it('is resilient to empty output', () => {
    const result = parseEncoderList('');
    expect(result.available).toEqual([]);
  });

  it('does not falsely match encoder names as substrings of other tokens', () => {
    // A deliberately adversarial line that contains "nvenc" inside a longer token.
    const output = ' V..... fake_nvencoder  Not a real encoder';
    const result = parseEncoderList(output);
    expect(result.available).toEqual([]);
  });
});
