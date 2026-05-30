import { describe, it, expect } from 'vitest';
import { gpuProbeResultSchema } from './gpu.schemas';

const baseDetails = {
  nvenc: null,
  qsv: null,
  amf: null,
  videotoolbox: null,
};

describe('gpuProbeResultSchema', () => {
  it('accepts a well-formed verified result', () => {
    const result = {
      available: ['nvenc'],
      details: { ...baseDetails, nvenc: { encoders: ['h264_nvenc'] } },
      verified: true,
    };
    expect(gpuProbeResultSchema.parse(result)).toEqual(result);
  });

  it('accepts an empty (no-hardware) result', () => {
    const result = { available: [], details: baseDetails, verified: true };
    expect(() => gpuProbeResultSchema.parse(result)).not.toThrow();
  });

  it('rejects a vendor advertised in `available` with null details (drift guard)', () => {
    const result = {
      available: ['qsv'],
      details: baseDetails, // qsv is null → refine must fail
      verified: true,
    };
    expect(() => gpuProbeResultSchema.parse(result)).toThrow();
  });

  it('rejects an unknown vendor', () => {
    const result = {
      available: ['intel'],
      details: baseDetails,
      verified: true,
    };
    expect(() => gpuProbeResultSchema.parse(result)).toThrow();
  });

  it('rejects a result missing the `verified` flag', () => {
    const result = {
      available: [],
      details: baseDetails,
    };
    expect(() => gpuProbeResultSchema.parse(result)).toThrow();
  });
});
