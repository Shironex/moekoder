import { z } from 'zod';

/** `app:version` — no args. */
export const appVersionSchema = z.tuple([]);

/** `app:open-external` — single URL string, must be a parseable URL. */
export const appOpenExternalSchema = z.tuple([z.string().url()]);

/**
 * `app:reveal-in-folder` — a single absolute path. The handler uses
 * `shell.showItemInFolder` which opens the native file manager with the item
 * highlighted; pass a file path, not a directory.
 */
export const appRevealInFolderSchema = z.tuple([z.string().min(1)]);
