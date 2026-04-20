import { useEffect, useState } from 'react';
import type { UserSettings, UserSettingsKey } from '@moekoder/shared';
import { useElectronAPI } from './useElectronAPI';
import { logger } from '@/lib/logger';

const log = logger('useSetting');

/**
 * Typed binding to a single `UserSettings` key, read through the preload
 * bridge. Returns a tuple in the idiomatic `useState` shape:
 *
 *   [value, setValue, loading]
 *
 * Initial read kicks off on mount. `setValue` persists through IPC and
 * mirrors the new value locally so subsequent reads don't need a roundtrip.
 * Unmount-during-fetch is handled via the `cancelled` sentinel so we never
 * call `setState` on a torn-down component.
 */
export const useSetting = <K extends UserSettingsKey>(key: K) => {
  const api = useElectronAPI();
  const [value, setValue] = useState<UserSettings[K] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.store
      .get(key)
      .then(v => {
        if (cancelled) return;
        setValue(v);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        log.error(`failed to read "${key}"`, err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, key]);

  const update = async (next: UserSettings[K]): Promise<void> => {
    await api.store.set(key, next);
    setValue(next);
  };

  return [value, update, loading] as const;
};
