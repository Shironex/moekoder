import { z } from 'zod';

/** All three `updater:*` channels are parameterless. */
export const updaterCheckSchema = z.tuple([]);
export const updaterDownloadSchema = z.tuple([]);
export const updaterInstallSchema = z.tuple([]);
