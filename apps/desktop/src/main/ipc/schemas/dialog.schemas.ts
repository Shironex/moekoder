import { z } from 'zod';
import { DIALOG_DIR_KINDS } from '@moekoder/shared';

/**
 * Zod tuples for the dialog IPC channels.
 *
 * Filters mirror Electron's `Electron.FileFilter` shape:
 *   `{ name: string; extensions: string[] }`.
 * We validate the structure but leave the `name` wording free-form because
 * the renderer chooses human-facing labels per dialog context.
 *
 * `kind` tags the invocation with a last-used-directory bucket. It is
 * optional — the handler falls back to a per-channel default — but note zod
 * strips unknown keys, so a renderer sending `kind` only has an effect
 * because it is declared here.
 */

const fileFilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string().min(1)),
});

const dialogDirKindSchema = z.enum(DIALOG_DIR_KINDS);

/**
 * `dialog:open-file` — one object with an array of filters and an optional
 * default path pre-selected in the OS dialog.
 */
export const dialogOpenFileSchema = z.tuple([
  z.object({
    filters: z.array(fileFilterSchema),
    defaultPath: z.string().optional(),
    kind: dialogDirKindSchema.optional(),
  }),
]);

/**
 * `dialog:open-files` — multi-select variant of `open-file`. Returns
 * `filePaths: string[]` (possibly empty when the user cancels).
 */
export const dialogOpenFilesSchema = z.tuple([
  z.object({
    filters: z.array(fileFilterSchema),
    defaultPath: z.string().optional(),
    kind: dialogDirKindSchema.optional(),
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
    kind: dialogDirKindSchema.optional(),
  }),
]);

/** `dialog:open-folder` — one object with an optional default path. */
export const dialogOpenFolderSchema = z.tuple([
  z.object({
    defaultPath: z.string().optional(),
    kind: dialogDirKindSchema.optional(),
  }),
]);
