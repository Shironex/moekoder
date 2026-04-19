import { z } from 'zod';

/** `app:version` — no args. */
export const appVersionSchema = z.tuple([]);

/** `app:open-external` — single URL string, must be a parseable URL. */
export const appOpenExternalSchema = z.tuple([z.string().url()]);
