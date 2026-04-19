import { useCallback, useState } from 'react';
import { useElectronAPI } from './useElectronAPI';
import type { GpuProbeResult } from '@/types/electron-api';

interface GpuProbeHook {
  result: GpuProbeResult | null;
  loading: boolean;
  error: string | null;
  probe: () => Promise<void>;
}

/**
 * On-demand GPU / hardware-encoder probe. Deliberately does NOT run on mount
 * — the probe spawns ffmpeg as a subprocess and we want it triggered from
 * the onboarding wizard (or the settings panel) rather than eagerly on every
 * screen render.
 */
export const useGpuProbe = (): GpuProbeHook => {
  const api = useElectronAPI();
  const [result, setResult] = useState<GpuProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.gpu.probe();
      setResult(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[useGpuProbe] probe failed', err);
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  return { result, loading, error, probe };
};
