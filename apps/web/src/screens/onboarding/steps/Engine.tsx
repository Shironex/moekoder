import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { useFfmpegInstall, type FfmpegInstallProbe } from '@/hooks';
import { cn } from '@/lib/cn';
import { formatMB } from '@/lib/format';
import { EngineGate } from './engine/EngineGate';
import { EngineLogPanel } from './engine/EngineLogPanel';
import { EngineStageRail } from './engine/EngineStageRail';

/** Subset of the parent's `useFfmpegStatus` return used by this step. */
export type EngineProbe = FfmpegInstallProbe;

interface EngineProps {
  /** Called once ffmpeg is confirmed installed (already present or just finished). */
  onReady: (version: string | null) => void;
  /** Pre-loaded ffmpeg status from Onboarding. */
  probe: EngineProbe;
}

/**
 * Step 02 · Engine. Ensures ffmpeg + ffprobe are installed on the user's
 * machine. The state machine + IPC wiring live in `useFfmpegInstall`; this
 * component is the thin view layer that renders whichever phase the hook
 * reports.
 */
export const Engine = ({ onReady, probe }: EngineProps) => {
  const {
    phase,
    stages,
    pct,
    downloadedBytes,
    totalBytes,
    log,
    activeStage,
    version,
    errorMsg,
    start,
    retry,
  } = useFfmpegInstall({ probe, onReady });

  // Hooks run in the same order every render regardless of which branch
  // renders later (Rules of Hooks — a past regression here bit us when an
  // early return sat above a useMemo).
  const busyHeadline = useMemo(() => {
    if (phase === 'already') return 'Already installed.';
    if (phase === 'done') return 'Engine ready.';
    if (phase === 'error') return 'Download failed.';
    return activeStage.label;
  }, [phase, activeStage]);

  if (phase === 'probing' || phase === 'needs-install') {
    return (
      <EngineGate
        probing={phase === 'probing'}
        onInstall={() => {
          void start();
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">引</span>
        <span>step 02 · engine</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>ffmpeg + ffprobe</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          Fetching the <em className="not-italic text-primary">engine.</em>
        </h1>
        <p className="max-w-[780px] text-sm leading-relaxed text-muted-foreground">
          MoeKoder is ffmpeg wearing a yukata — and it needs the binaries. We download the official{' '}
          <b className="text-foreground">BtbN ffmpeg 7.0.1</b> build, verify its SHA-256 against the
          manifest, and drop it in your AppData.{' '}
          <b className="text-foreground">One-time, ~180 MB, then never again.</b>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-5">
            <div className="flex items-center gap-3">
              <span className="font-display text-3xl leading-none text-primary">
                {phase === 'done' || phase === 'already' ? '了' : activeStage.k}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="font-display text-base text-foreground">{busyHeadline}</b>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  {phase === 'already'
                    ? (version ?? 'local binaries found')
                    : phase === 'error'
                      ? 'retry to try again'
                      : activeStage.sub}
                </span>
              </div>
              <span className="font-display text-3xl leading-none text-foreground">
                {Math.round(pct)}
                <em className="not-italic text-muted-foreground">%</em>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-popover">
              <div
                className={cn(
                  'h-full transition-[width] duration-300',
                  phase === 'error' ? 'bg-bad' : 'bg-primary'
                )}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
              <div>
                <b className="text-foreground">
                  {formatMB(downloadedBytes)} / {totalBytes > 0 ? formatMB(totalBytes) : '—'} MB
                </b>{' '}
                downloaded
              </div>
              <div className="text-right">
                <b className="text-foreground">
                  {phase === 'done' || phase === 'already' ? 'done' : 'working'}
                </b>{' '}
                · {activeStage.id}
              </div>
            </div>
          </div>

          <EngineLogPanel log={log} phase={phase} activeStage={activeStage} />

          {phase === 'error' && (
            <div className="flex items-center gap-3 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3">
              <span className="font-display text-2xl text-bad">否</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="font-display text-sm text-foreground">Install failed</b>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {errorMsg ?? 'unknown error'}
                </span>
              </div>
              <Button variant="primary" size="sm" onClick={retry}>
                <RefreshCw size={13} />
                Retry
              </Button>
            </div>
          )}
        </div>

        <EngineStageRail stages={stages} />
      </div>
    </div>
  );
};
