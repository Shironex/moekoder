import { useCallback, useEffect } from 'react';
import { useAppStore } from '@/stores';
import { logger } from '@/lib/logger';
import { useElectronAPI } from './useElectronAPI';

const log = logger('sidebar');

/**
 * Shell views that don't render a sidebar at all. The Ctrl/Cmd+B hotkey is
 * suppressed on these so the keypress stays a normal `b` character instead
 * of firing a no-op toggle behind the scenes.
 */
const SUPPRESSED_HOTKEY_VIEWS = new Set(['splash', 'onboarding', 'crash']);

/**
 * Owns the sidebar-collapsed toggle + its Ctrl/Cmd+B hotkey binding.
 *
 * Reads the latest collapsed value from the store at toggle-time (rather
 * than closing over a snapshot), so concurrent triggers — e.g. the edge
 * handle click landing in the same frame as the hotkey — don't both flip
 * off the same stale value. Persists through `store:set`; swallows transient
 * IPC errors since a missed write reconciles on the next successful one.
 *
 * Returns the toggle handler so callers can wire it to UI (sidebar edge
 * affordance) — the hotkey is installed as a side effect.
 */
export const useSidebarToggle = (): (() => Promise<void>) => {
  const api = useElectronAPI();
  const activeView = useAppStore(s => s.activeView);
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed);

  const onToggle = useCallback(async (): Promise<void> => {
    const next = !useAppStore.getState().sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      await api.store.set('sidebarCollapsed', next);
    } catch (err) {
      log.warn('sidebar persist failed', err);
    }
  }, [api, setSidebarCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'b') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (SUPPRESSED_HOTKEY_VIEWS.has(activeView)) return;
      e.preventDefault();
      void onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeView, onToggle]);

  return onToggle;
};
