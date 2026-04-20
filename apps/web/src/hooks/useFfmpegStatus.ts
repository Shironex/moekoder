import { useCallback, useEffect, useState } from 'react';
import { useElectronAPI } from './useElectronAPI';
import { logger } from '@/lib/logger';

const log = logger('useFfmpegStatus');

interface FfmpegStatus {
  installed: boolean;
  version: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Read ffmpeg install state once on mount, then expose a `refresh()` for the
 * caller to re-check after `ensureBinaries()` finishes. No event stream today
 * — install progress has its own dedicated channel (`onDownloadProgress`).
 */
export const useFfmpegStatus = (): FfmpegStatus => {
  const api = useElectronAPI();
  const [installed, setInstalled] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [isInstalled, v] = await Promise.all([
        api.ffmpeg.isInstalled(),
        api.ffmpeg.getVersion(),
      ]);
      setInstalled(isInstalled);
      setVersion(v);
    } catch (err) {
      log.error('probe failed', err);
      setInstalled(false);
      setVersion(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { installed, version, loading, refresh: load };
};
