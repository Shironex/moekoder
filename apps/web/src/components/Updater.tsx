import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { UPDATER_EVENT_CHANNELS } from '@moekoder/shared';
import { Button } from '@/components/ui';
import { useElectronAPI } from '@/hooks';
import { cn } from '@/lib/cn';
import { logger } from '@/lib/logger';

const log = logger('updater');

type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'not-available';

interface AvailablePayload {
  version?: string;
  releaseName?: string;
}

interface ProgressPayload {
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

/**
 * Extract a version string from whatever shape the main process emits. The
 * electron-updater `UpdateInfo` object uses `version`; older payloads use
 * `releaseName`. Anything else falls through to `null` so the UI gracefully
 * degrades to an unversioned "Update available" pill.
 */
const pickVersion = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as AvailablePayload;
  return obj.version ?? obj.releaseName ?? null;
};

/**
 * Pull a 0..1 progress fraction out of an electron-updater
 * `ProgressInfo` payload. `percent` is already 0..100, so we scale down;
 * when missing, we fall back to transferred/total. Returns `null` when we
 * can't guess — the panel degrades to an indeterminate bar.
 */
const pickProgress = (payload: unknown): number | null => {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as ProgressPayload;
  if (typeof obj.percent === 'number' && Number.isFinite(obj.percent)) {
    return Math.max(0, Math.min(1, obj.percent / 100));
  }
  if (typeof obj.transferred === 'number' && typeof obj.total === 'number' && obj.total > 0) {
    return Math.max(0, Math.min(1, obj.transferred / obj.total));
  }
  return null;
};

/**
 * Bottom-right updater notification panel. Subscribes to the six
 * `updater:*` one-way event channels from the main process and exposes a
 * tiny state machine:
 *
 *   checking     → small muted "Checking for updates…" pill (auto-hides on
 *                  the next event, regardless of what it is)
 *   available    → version chip + "Download" button → updater.download()
 *   downloading  → version chip + progress bar (percent from payload)
 *   downloaded   → "Restart & install" CTA → updater.install()
 *   error        → small muted pill, auto-hides after 5s
 *   not-available→ panel hides entirely
 *
 * The component manages its own auto-hide timer; we `useRef` the timeout
 * handle so the dismiss effect can always clear the pending hide when a
 * new event arrives mid-countdown.
 */
export const Updater = () => {
  const api = useElectronAPI();
  const [phase, setPhase] = useState<UpdaterPhase>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const clearHide = useCallback((): void => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(
    (ms: number): void => {
      clearHide();
      hideTimer.current = window.setTimeout(() => {
        setPhase('idle');
        hideTimer.current = null;
      }, ms);
    },
    [clearHide]
  );

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.CHECKING, () => {
        clearHide();
        setPhase('checking');
      })
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.AVAILABLE, payload => {
        clearHide();
        setVersion(pickVersion(payload));
        setProgress(null);
        setPhase('available');
      })
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.NOT_AVAILABLE, () => {
        clearHide();
        setPhase('idle');
      })
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.DOWNLOAD_PROGRESS, payload => {
        clearHide();
        setProgress(pickProgress(payload));
        setPhase('downloading');
      })
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.DOWNLOADED, payload => {
        clearHide();
        setVersion(prev => pickVersion(payload) ?? prev);
        setPhase('downloaded');
      })
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.ERROR, () => {
        setPhase('error');
        scheduleHide(5_000);
      })
    );

    return () => {
      for (const u of unsubs) {
        try {
          u();
        } catch (err) {
          log.warn('unsubscribe failed', err);
        }
      }
      clearHide();
    };
  }, [api, clearHide, scheduleHide]);

  const handleDownload = useCallback(async (): Promise<void> => {
    try {
      await api.updater.download();
    } catch (err) {
      log.warn('download failed', err);
    }
  }, [api]);

  const handleInstall = useCallback(async (): Promise<void> => {
    try {
      await api.updater.install();
    } catch (err) {
      log.warn('install failed', err);
    }
  }, [api]);

  const handleDismiss = useCallback((): void => {
    clearHide();
    setPhase('idle');
  }, [clearHide]);

  if (phase === 'idle') return null;

  const pct = progress ?? 0;
  const pctLabel = progress !== null ? `${Math.round(pct * 100)}%` : '…';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-6 right-6 z-50 w-[360px] rounded-xl border border-border bg-popover/95 p-4 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.5)] backdrop-blur',
        phase === 'error' && 'border-bad/40'
      )}
    >
      {/* Common header pill */}
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-base tracking-normal text-primary">新</span>
        <span>{phase === 'error' ? 'update · error' : 'update · 新 · shin'}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleDismiss}
          className="text-muted transition hover:text-foreground"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {phase === 'checking' && (
        <p className="font-mono text-[11px] text-muted-foreground">Checking for updates…</p>
      )}

      {phase === 'available' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <b className="font-display text-base text-foreground">Update available</b>
            <span className="font-mono text-[11px] text-muted-foreground">
              {version ? (
                <>
                  New version · <span className="text-primary">v{version}</span>
                </>
              ) : (
                'A new MoeKoder release is ready to download.'
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleDownload}>
              <Download size={14} />
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              Later
            </Button>
          </div>
        </div>
      )}

      {phase === 'downloading' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <b className="font-display text-base text-foreground">Downloading update</b>
            <span className="font-mono text-[11px] text-primary">{pctLabel}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-card">
            <div
              className={cn(
                'h-full bg-primary transition-[width] duration-300',
                progress === null && 'animate-pulse'
              )}
              style={{ width: `${progress !== null ? pct * 100 : 30}%` }}
            />
          </div>
        </div>
      )}

      {phase === 'downloaded' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <b className="font-display text-base text-foreground">Update ready to install</b>
            <span className="font-mono text-[11px] text-muted-foreground">
              MoeKoder will close, install, and reopen.
              {version && (
                <>
                  {' '}
                  <span className="text-primary">v{version}</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleInstall}>
              <RefreshCw size={14} />
              Restart & install
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              Later
            </Button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <p className="font-mono text-[11px] text-muted-foreground">Update check failed.</p>
      )}
    </div>
  );
};
