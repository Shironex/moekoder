import { useEffect } from 'react';
import { useAppStore, useEncodeStore } from '@/stores';

/**
 * Advance the shell view when the encode reaches a terminal phase.
 *
 *   · `done`      → `single-done`
 *   · `cancelled` → reset the encode store + slide back to `single-idle`
 *                   so the pipeline is immediately ready for the next job
 *
 * Running the transition here (rather than inside `useEncodeEvents`) keeps
 * the IPC subscription hook purely "wire → store" and leaves route control
 * on the app shell. No-op unless the shell is currently on `single-encoding`
 * so that a stale terminal phase doesn't bounce the user off Settings/About.
 */
export const useEncodeTransitions = (): void => {
  const activeView = useAppStore(s => s.activeView);
  const setView = useAppStore(s => s.setView);
  const phase = useEncodeStore(s => s.phase);
  const resetEncode = useEncodeStore(s => s.reset);

  useEffect(() => {
    if (activeView !== 'single-encoding') return;
    if (phase === 'done') {
      setView('single-done');
    } else if (phase === 'cancelled') {
      resetEncode();
      setView('single-idle');
    }
  }, [phase, activeView, setView, resetEncode]);
};
