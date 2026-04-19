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
  const { setProgress, appendLog, setResult, setError, setPhase } = useEncodeStore(s => ({
    setProgress: s.setProgress,
    appendLog: s.appendLog,
    setResult: s.setResult,
    setError: s.setError,
    setPhase: s.setPhase,
  }));

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
