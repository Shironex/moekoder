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

/**
 * `app:open-logs-folder` — no args. Reveals the `<userData>/logs` directory
 * in the OS file manager. Used by the Settings screen's "Open logs folder"
 * row so users can grab a log bundle when filing an issue.
 */
export const appOpenLogsFolderSchema = z.tuple([]);
