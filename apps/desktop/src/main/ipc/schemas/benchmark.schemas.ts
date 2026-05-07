import { z } from 'zod';

/**
 * Zod tuples for the benchmark IPC channel.
 *
 * `settings` stays loose (Record<string, unknown>) the same way
 * `encode:start` does — the orchestrator + arg builder revalidate the
 * shape downstream.
 */
export const benchmarkRunSchema = z.tuple([
  z.object({
    videoPath: z.string().min(1),
    subtitlePath: z.string().min(1),
    startSec: z.number().finite().nonnegative().optional(),
    durationSec: z.number().finite().positive().optional(),
    candidates: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          settings: z.record(z.string(), z.unknown()),
          container: z.union([z.literal('mp4'), z.literal('mkv')]),
        })
      )
      .min(1)
      .max(4),
  }),
]);
