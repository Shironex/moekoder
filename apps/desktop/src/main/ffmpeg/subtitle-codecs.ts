/**
 * Subtitle codec ⇄ container/extension mapping (v0.6.0).
 *
 * Shared by the soft-sub mux path (Feature A — external `.ass` → MKV track)
 * and the subtitle extractor (Feature B — MKV track → standalone file).
 *
 * Two distinct lookups live here because the two features approach the same
 * relationship from opposite ends:
 *
 *   - Mux starts from an external subtitle *file* and needs the ffmpeg
 *     `-c:s <codec>` token that re-muxes it into Matroska as a native
 *     stream ({@link subtitleCodecForExtension}).
 *   - Extract starts from a probed *stream codec* (`codec_name` as ffprobe
 *     reports it) and needs the output file extension a `-c:s copy` will
 *     accept without the muxer rejecting the codec/extension mismatch
 *     ({@link extensionForSubtitleCodec}).
 *
 * Image-based subtitle codecs (`hdmv_pgs_subtitle`, `dvd_subtitle`) are NOT
 * representable as text and cannot be copied into `.ass`/`.srt`; callers
 * gate them out via {@link isTextSubtitleCodec}.
 */

/**
 * ffprobe `codec_name` values that carry *text* subtitle data and can be
 * stream-copied to a standalone file. Everything else (image subs like
 * `hdmv_pgs_subtitle` / `dvd_subtitle`) is excluded — those are bitmaps and
 * have no `.ass`/`.srt` representation.
 */
const TEXT_SUBTITLE_CODECS = new Set(['ass', 'ssa', 'subrip', 'srt', 'webvtt', 'mov_text']);

/**
 * Map the codec ffprobe reports for a subtitle stream onto the output file
 * extension a `-c:s copy` extraction must use. The muxer rejects a mismatch
 * (e.g. copying an `ass` stream into a `.srt` file errors), so the caller
 * MUST derive the extension from the codec rather than letting the user pick.
 *
 * Returns `null` for codecs we can't copy to a text file (image subs, or an
 * unrecognised codec) so callers can disable the corresponding row.
 */
export const extensionForSubtitleCodec = (codec: string): string | null => {
  switch (codec) {
    case 'ass':
    case 'ssa':
      // libavcodec reports both SSA and ASS as `ass`; `.ass` is the modern
      // container extension and Aegisub opens both forms.
      return 'ass';
    case 'subrip':
    case 'srt':
      return 'srt';
    case 'webvtt':
      return 'vtt';
    case 'mov_text':
      // MP4 timed text — copying it standalone is an edge case; we still
      // know the natural extension if a caller opts in later.
      return 'ttxt';
    default:
      return null;
  }
};

/**
 * Map an external subtitle file's extension (no leading dot, any case) onto
 * the ffmpeg `-c:s <codec>` token that muxes it into Matroska as a native
 * stream. `.ass`/`.ssa` both ride the `ass` codec (MKV's native form);
 * `.srt` rides `srt`. Returns `null` for an unsupported extension so the mux
 * caller can fall back to `copy` (the explicit form the roadmap specifies).
 */
export const subtitleCodecForExtension = (ext: string): string | null => {
  switch (ext.toLowerCase().replace(/^\./, '')) {
    case 'ass':
    case 'ssa':
      return 'ass';
    case 'srt':
      return 'srt';
    case 'vtt':
    case 'webvtt':
      return 'webvtt';
    default:
      return null;
  }
};

/** Whether a probed subtitle stream codec is text (and thus extractable). */
export const isTextSubtitleCodec = (codec: string): boolean => TEXT_SUBTITLE_CODECS.has(codec);

/**
 * Output format the user chose for an extraction:
 *   - `'source'` keeps the embedded stream verbatim (`-c:s copy`).
 *   - `'ass'` / `'srt'` force that format, transcoding when the source differs.
 *
 * `.ass` is the default in the UI because anime subtitles are authored in ASS
 * and stripping to SubRip loses styling/positioning.
 */
export type SubtitleOutputFormat = 'source' | 'ass' | 'srt';

/**
 * Resolve the ffmpeg `-c:s` token and the output file extension for extracting
 * a stream of `sourceCodec` to the requested `format`.
 *
 *   - `'source'` copies the stream verbatim — the extension follows the source
 *     codec (`ass`→`.ass`, `subrip`→`.srt`, …).
 *   - `'ass'` / `'srt'` copy when the source already matches that format, and
 *     otherwise transcode (`-c:s ass` / `-c:s srt`). ffmpeg converts freely
 *     between text subtitle formats; ASS→SRT drops styling/positioning, which
 *     is the documented trade-off when the user picks SRT.
 *
 * Returns `null` for codecs that aren't text (image subs), so callers can keep
 * gating those rows out.
 */
export const resolveSubtitleOutput = (
  sourceCodec: string,
  format: SubtitleOutputFormat
): { codecArg: string; ext: string } | null => {
  if (!isTextSubtitleCodec(sourceCodec)) return null;

  const sourceExt = extensionForSubtitleCodec(sourceCodec);

  if (format === 'source') {
    // Copy verbatim. Fall back to `.ass` only if the codec has no known
    // extension (shouldn't happen for a text codec, but keeps a sane default).
    return { codecArg: 'copy', ext: sourceExt ?? 'ass' };
  }

  // `format` is also the target extension ('ass' | 'srt'). Copy when the source
  // already carries that format; otherwise transcode to the requested encoder.
  if (sourceExt === format) {
    return { codecArg: 'copy', ext: format };
  }
  return { codecArg: format, ext: format };
};
