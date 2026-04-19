import { z } from 'zod';

/**
 * Zod tuples for the dialog IPC channels.
 *
 * Filters mirror Electron's `Electron.FileFilter` shape:
 *   `{ name: string; extensions: string[] }`.
 * We validate the structure but leave the `name` wording free-form because
 * the renderer chooses human-facing labels per dialog context.
 */

const fileFilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string().min(1)),
});

/**
 * `dialog:open-file` — one object with an array of filters and an optional
 * default path pre-selected in the OS dialog.
 */
export const dialogOpenFileSchema = z.tuple([
  z.object({
    filters: z.array(fileFilterSchema),
    defaultPath: z.string().optional(),
  }),
]);

/**
 * `dialog:save-file` — identical input shape to `open-file`; the handler
 * dispatches to `dialog.showSaveDialog` instead.
 */
export const dialogSaveFileSchema = z.tuple([
  z.object({
    filters: z.array(fileFilterSchema),
    defaultPath: z.string().optional(),
  }),
]);

/** `dialog:open-folder` — one object with an optional default path. */
export const dialogOpenFolderSchema = z.tuple([
  z.object({
    defaultPath: z.string().optional(),
  }),
]);
