import { useEffect } from 'react';
import { useElectronAPI } from './useElectronAPI';
import { useEncodeStore } from '@/stores';

/**
 * Side-effect hook. Subscribes to the preload's encode event stream on mount
 * and pipes every progress / log / completion / error payload into
 * `useEncodeStore`, so any screen can read encode state without caring about
 * the IPC wiring.
 *
 * Call exactly once at a stable location in the tree (App.tsx). Re-running
 * on unstable renders is fine — unsubscribe is reference-counted by
 * ipcRenderer — but the extra listener churn is wasteful.
 */
export const useEncodeEvents = (): void => {
  const api = useElectronAPI();
  // Select each setter individually — returning a fresh object from a Zustand
  // selector on every render triggers useSyncExternalStore's "getSnapshot
  // should be cached" warning and causes an infinite re-render loop, because
  // every snapshot is reference-different from the last.
  const setProgress = useEncodeStore(s => s.setProgress);
  const appendLog = useEncodeStore(s => s.appendLog);
  const setResult = useEncodeStore(s => s.setResult);
  const setError = useEncodeStore(s => s.setError);
  const setPhase = useEncodeStore(s => s.setPhase);

  useEffect(() => {
    const offProgress = api.encode.onProgress((_jobId, p) => {
      setProgress(p);
    });
    const offLog = api.encode.onLog((_jobId, line) => {
      appendLog(line);
    });
    const offComplete = api.encode.onComplete((_jobId, result) => {
      setResult(result);
      setPhase('done');
    });
    const offError = api.encode.onError((_jobId, error) => {
      setError(error);
      setPhase('error');
    });

    return () => {
      offProgress();
      offLog();
      offComplete();
      offError();
    };
  }, [api, setProgress, appendLog, setResult, setError, setPhase]);
};
