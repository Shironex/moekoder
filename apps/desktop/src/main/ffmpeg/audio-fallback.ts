/**
 * Audio-fallback decision helper.
 *
 * Some source audio codecs — TrueHD, DTS, FLAC, raw PCM — cannot be
 * stream-copied into an MP4 container. ffmpeg's muxer refuses with
 * `Could not find tag for codec … in stream` and the encode dies with an
 * opaque non-zero exit. The orchestrator consults this helper up-front
 * and flips the audio plan to AAC 192k so the encode succeeds transparently.
 *
 * Kept in its own module so renderer previews (Phase 4) can import the
 * pure predicate without pulling in the ffmpeg arg builder.
 */
import type { EncodingSettings } from './settings';

/**
 * Source audio codecs that ffmpeg refuses to stream-copy into an MP4
 * container. Canonicalised to lowercase; ffprobe emits these names
 * directly in the `codec_name` field.
 */
const LOSSLESS_IN_MP4_INCOMPATIBLE = new Set(['truehd', 'dts', 'flac', 'pcm_s16le', 'pcm_s24le']);

/**
 * Returns true when the source audio cannot be stream-copied into the
 * chosen container and must be transcoded. Currently only fires for the
 * MP4 + lossless-source combination — MKV is permissive and accepts the
 * full incompatible set above.
 */
export const shouldTranscodeAudio = (
  sourceCodec: string | undefined,
  container: EncodingSettings['container']
): boolean => {
  if (container !== 'mp4' || !sourceCodec) return false;
  return LOSSLESS_IN_MP4_INCOMPATIBLE.has(sourceCodec.toLowerCase());
};
