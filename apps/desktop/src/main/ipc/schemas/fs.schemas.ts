import { z } from 'zod';

/**
 * `fs:list-folder` — enumerate the immediate children of a folder, filtering
 * by extension. Used by the renderer's drop-overlay so a dropped folder can
 * surface its videos + subtitles for auto-pairing without falling back to
 * native folder scanning in the renderer (where Node fs is unreachable).
 *
 * Extensions arrive WITH the leading dot (e.g. `.mkv`). The handler is
 * non-recursive on purpose: anime release folders are flat, and recursing
 * pulls in chapter art / preview clips we'd then have to filter back out.
 */
export const fsListFolderSchema = z.tuple([
  z.object({
    folderPath: z.string().min(1),
    videoExtensions: z.array(z.string().min(1)),
    subtitleExtensions: z.array(z.string().min(1)),
  }),
]);
