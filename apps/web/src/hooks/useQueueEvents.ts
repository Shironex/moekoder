import { useEffect } from 'react';
import { useElectronAPI } from './useElectronAPI';
import { useQueueStore } from '@/stores/useQueueStore';
import { logger } from '@/lib/logger';

const log = logger('queue-events');

/**
 * Side-effect hook. Pulls the initial snapshot once on mount, then
 * subscribes to `queue:changed` / `queue:item:progress` / `queue:item:log`
 * for the rest of the session. Lives at a stable App-level mount point so
 * the listener count stays at exactly one per channel.
 *
 * Mirrors the structure of `useEncodeEvents` — same selector-isolation
 * pattern (each setter via `useQueueStore(s => s.fn)` so the effect's
 * dependency array stays stable).
 */
export const useQueueEvents = (): void => {
  const api = useElectronAPI();
  const applySnapshot = useQueueStore(s => s.applySnapshot);
  const applyItemProgress = useQueueStore(s => s.applyItemProgress);
  const applyItemLog = useQueueStore(s => s.applyItemLog);

  useEffect(() => {
    let cancelled = false;
    api.queue
      .getSnapshot()
      .then(snapshot => {
        if (!cancelled) applySnapshot(snapshot);
      })
      .catch(err => log.warn('initial queue snapshot fetch failed', err));

    const offChanged = api.queue.onChanged(snapshot => applySnapshot(snapshot));
    const offProgress = api.queue.onItemProgress(payload =>
      applyItemProgress(payload.itemId, payload.progress)
    );
    const offLog = api.queue.onItemLog(payload => applyItemLog(payload.itemId, payload.line));

    return () => {
      cancelled = true;
      offChanged();
      offProgress();
      offLog();
    };
  }, [api, applySnapshot, applyItemProgress, applyItemLog]);
};
