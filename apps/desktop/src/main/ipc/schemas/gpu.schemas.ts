import { z } from 'zod';

/** `gpu:probe` — no args. */
export const gpuProbeSchema = z.tuple([]);

const gpuVendorSchema = z.enum(['nvenc', 'qsv', 'amf', 'videotoolbox']);

const vendorDetailSchema = z.object({ encoders: z.array(z.string()) }).nullable();

/**
 * Result shape returned by `probeGpu`. The IPC framework's `handle()` only
 * validates *args* (a tuple), so the handler calls `.parse()` on the result
 * with this schema before returning. The `.refine()` guards against drift
 * where a vendor is advertised in `available` but its `details` entry is null.
 */
export const gpuProbeResultSchema = z
  .object({
    available: z.array(gpuVendorSchema),
    details: z.object({
      nvenc: vendorDetailSchema,
      qsv: vendorDetailSchema,
      amf: vendorDetailSchema,
      videotoolbox: vendorDetailSchema,
    }),
    verified: z.boolean(),
  })
  .refine(r => r.available.every(v => r.details[v] !== null), {
    message: 'every vendor in `available` must have non-null `details`',
  });
