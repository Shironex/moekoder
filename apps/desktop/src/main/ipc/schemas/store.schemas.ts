import { z } from 'zod';

/**
 * Tuple schemas for the `store:*` channels.
 *
 * The key is validated as `string` at the schema layer so zod can reject
 * non-string payloads up front. The handler then narrows to the specific
 * `UserSettingsKey` enum, throwing `IpcError('INVALID_INPUT')` for keys
 * outside the shared settings schema. Splitting the check this way keeps
 * the zod layer simple and lets the handler emit a crisp error message.
 */
export const storeGetSchema = z.tuple([z.string()]);
export const storeSetSchema = z.tuple([z.string(), z.unknown()]);
export const storeDeleteSchema = z.tuple([z.string()]);
