import { z } from 'zod';

/**
 * Zod tuple for the `subtitle:extract` channel (v0.6.0).
 *
 * One object per extracted track: the source container, the subtitle ordinal
 * (0-based among subtitle streams), the probed codec (used to validate the
 * output extension before spawning), and the absolute output path. Listing
 * the available tracks reuses the existing `ffmpeg:probe` channel, so there
 * is no separate list schema.
 */
export const subtitleExtractSchema = z.tuple([
  z.object({
    videoPath: z.string().min(1),
    /** Subtitle ordinal among subtitle streams (maps to `0:s:<N>`). */
    streamIndex: z.number().int().nonnegative(),
    /** Probed `codec_name` for the stream (e.g. `ass`, `subrip`). */
    codec: z.string().min(1),
    /**
     * Desired output format. `'source'` copies verbatim; `'ass'`/`'srt'`
     * force that format (transcoding when the source differs). Defaults to
     * `'source'` when omitted.
     */
    format: z.enum(['source', 'ass', 'srt']).optional(),
    outputPath: z.string().min(1),
  }),
]);
