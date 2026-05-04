import { z } from 'zod';

/**
 * Zod tuples for the `queue:*` IPC channels.
 *
 * Concurrency clamps to 1..4 (matching the `UserSettings.queueConcurrency`
 * literal type). `maxRetries` and `backoffMs` are bounded so a hand-edited
 * payload can't ask the manager for a retry storm or a 30-day backoff.
 */

export const queueAddItemsSchema = z.tuple([
  z
    .array(
      z.object({
        videoPath: z.string().min(1),
        videoName: z.string().min(1),
        subtitlePath: z.string().min(1),
        subtitleName: z.string().min(1),
        outputPath: z.string().min(1),
      })
    )
    .min(1),
]);

export const queueRemoveItemSchema = z.tuple([z.string().min(1)]);
export const queueCancelItemSchema = z.tuple([z.string().min(1)]);
export const queueRetryItemSchema = z.tuple([z.string().min(1)]);

export const queueReorderSchema = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

export const queueUpdateOutputSchema = z.tuple([z.string().min(1), z.string().min(1)]);

export const queueSetSettingsSchema = z.tuple([
  z
    .object({
      concurrency: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
      maxRetries: z.number().int().min(0).max(10).optional(),
      backoffMs: z
        .number()
        .int()
        .min(0)
        .max(5 * 60_000)
        .optional(),
      encoding: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
]);
