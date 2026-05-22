/**
 * Renderer-side subtitle codec helpers for the Extract screen (v0.6.0).
 *
 * Structural mirror of the desktop `ffmpeg/subtitle-codecs.ts` lookups — the
 * renderer bundle never imports main-process modules, so the small mapping is
 * restated here. The Extract screen uses these to decide which probed tracks
 * are selectable (text) vs disabled (image) and to derive the output file
 * extension a `-c:s copy` extraction must use.
 */

const TEXT_SUBTITLE_CODECS = new Set(['ass', 'ssa', 'subrip', 'srt', 'text', 'webvtt', 'mov_text']);

/** Whether a probed subtitle stream codec carries extractable text. */
export const isTextSubtitleCodec = (codec: string): boolean => TEXT_SUBTITLE_CODECS.has(codec);

/**
 * Output file extension (no leading dot) for a `-c:s copy` extraction of the
 * given codec. Returns `null` for codecs we can't copy to a text file.
 */
export const extensionForSubtitleCodec = (codec: string): string | null => {
  switch (codec) {
    case 'ass':
    case 'ssa':
      return 'ass';
    case 'subrip':
    case 'srt':
      return 'srt';
    case 'webvtt':
      return 'vtt';
    case 'mov_text':
      return 'ttxt';
    default:
      return null;
  }
};

/**
 * Output format the user picks on the Extract screen. Mirrors the desktop
 * `SubtitleOutputFormat`. `'source'` keeps the embedded stream as-is; `'ass'`
 * / `'srt'` force that format (the main process transcodes when the source
 * differs). `.ass` is the default because anime subtitles are authored in ASS.
 */
export type SubtitleOutputFormat = 'source' | 'ass' | 'srt';

/**
 * The output file extension a given source `codec` produces for the chosen
 * `format`. `'ass'`/`'srt'` always land on that extension (transcoding if
 * needed); `'source'` follows the source codec. Returns `null` for codecs we
 * can't write to text (image subs).
 */
export const outputExtForFormat = (codec: string, format: SubtitleOutputFormat): string | null => {
  if (!isTextSubtitleCodec(codec)) return null;
  if (format === 'ass' || format === 'srt') return format;
  return extensionForSubtitleCodec(codec);
};

/**
 * Human label for why an image subtitle track can't be exported. Returns
 * `null` for text codecs (no warning needed).
 */
export const imageSubtitleHint = (codec: string): string | null => {
  if (isTextSubtitleCodec(codec)) return null;
  return 'Image-based subtitles (PGS/VOBSUB) can’t export to .ass/.srt.';
};
