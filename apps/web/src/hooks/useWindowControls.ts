import { useMemo } from 'react';
import { logger } from '@/lib/logger';

interface WindowControls {
  onMin: () => void;
  onMax: () => void;
  onClose: () => void;
}

/**
 * Fire-and-forget wrapper around `electronAPI.window.{minimize,maximize,close}`.
 * The preload returns promises so rejections are observable; we log them and
 * swallow so a transient IPC hiccup (e.g. focus loss mid-call) never surfaces
 * as an unhandled promise rejection. Used by both the main Titlebar and the
 * onboarding layout's embedded titlebar so the three call sites stay in sync.
 */
export const useWindowControls = (context: string): WindowControls =>
  useMemo(() => {
    const log = logger(context);
    const winApi = window.electronAPI?.window;
    const logErr = (action: string) => (err: unknown) => {
      log.warn(`window:${action} failed`, err);
    };
    return {
      onMin: () => void winApi?.minimize().catch(logErr('minimize')),
      onMax: () => void winApi?.maximize().catch(logErr('maximize')),
      onClose: () => void winApi?.close().catch(logErr('close')),
    };
  }, [context]);
