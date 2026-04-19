import { z } from 'zod';

/**
 * Zod tuples for the encode IPC channels.
 *
 * Keep the input shapes narrow: strings are non-empty, numbers are finite
 * positives, and `settings` stays loose so renderer code can feed the
 * partial overrides straight from a form without pre-normalising.
 */

/**
 * `encode:start` — one object holding the three paths plus an optional
 * partial `settings` override merged onto the Balanced preset.
 */
export const encodeStartSchema = z.tuple([
  z.object({
    videoPath: z.string().min(1),
    subtitlePath: z.string().min(1),
    outputPath: z.string().min(1),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),
]);

/** `encode:cancel` — one jobId string. */
export const encodeCancelSchema = z.tuple([z.string().min(1)]);

/**
 * `encode:get-preflight` — one object. `durationSec` + `bitrateKbps` are
 * supplied by the renderer (it has a probe result already), avoiding a
 * redundant ffprobe spawn on every preflight call.
 */
export const encodeGetPreflightSchema = z.tuple([
  z.object({
    videoPath: z.string().min(1),
    outputDir: z.string().min(1),
    durationSec: z.number().finite().positive(),
    bitrateKbps: z.number().finite().positive(),
  }),
]);
