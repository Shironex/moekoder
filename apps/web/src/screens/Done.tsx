import { Button, IconOpen, IconPlay, PageHead } from '@/components/ui';
import { useElectronAPI } from '@/hooks';
import { useAppStore, useEncodeStore } from '@/stores';
import { basename } from '@/lib/paths';
import { formatBytes, formatDuration } from '@/lib/format';
import { logger } from '@/lib/logger';

const log = logger('done');

interface DoneProps {
  /** Called when the user wants to start another encode. */
  onReset?: () => void;
}

interface StatProps {
  value: string;
  label: string;
}

const Stat = ({ value, label }: StatProps) => (
  <div className="flex flex-col gap-1 rounded-md border border-border bg-card/40 px-5 py-4">
    <div className="font-display text-3xl text-foreground">{value}</div>
    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">{label}</div>
  </div>
);

/**
 * Completion screen. Reads from `useEncodeStore.result` so the parent only
 * has to transition `activeView` — the data is already in Zustand via the
 * `encode:complete` IPC event. "Open folder" asks the main process to
 * highlight the output file; "Encode another" resets the encode store and
 * ships the user back to idle.
 */
export const DoneScreen = ({ onReset }: DoneProps) => {
  const api = useElectronAPI();
  const result = useEncodeStore(s => s.result);
  const reset = useEncodeStore(s => s.reset);
  const setView = useAppStore(s => s.setView);

  // No result means the store was manually navigated to — render a neutral
  // placeholder rather than crashing.
  if (!result) {
    return (
      <section className="flex flex-1 items-center justify-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          no encode on record · 空
        </div>
      </section>
    );
  }

  const handleOpenFolder = async (): Promise<void> => {
    try {
      await api.app.revealInFolder(result.file);
    } catch (err) {
      log.error('app.revealInFolder failed', err);
    }
  };

  const handleReset = (): void => {
    reset();
    if (onReset) {
      onReset();
    } else {
      setView('single-idle');
    }
  };

  const avgFpsLabel = result.avgFps > 0 ? result.avgFps.toFixed(0) : '—';
  const speedup =
    result.durationSec > 0 && result.avgFps > 0 ? `${(result.avgFps / 24).toFixed(1)}` : '—';

  return (
    <section className="relative flex flex-1 flex-col gap-8 overflow-hidden px-10 py-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -bottom-24 select-none font-display text-[420px] leading-none tracking-[-0.05em] text-primary/[0.05]"
      >
        了
      </span>

      <PageHead
        screen="done"
        route="single"
        title="Done. Nicely."
        right={
          <div className="flex flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            <span className="text-good">session complete</span>
            <span className="text-foreground">
              <b>{basename(result.file)}</b>
            </span>
            <span>saved</span>
          </div>
        }
      />

      <div className="relative z-[1] flex flex-1 flex-col items-start gap-6 rounded-lg border border-border bg-card/30 p-10">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-6 top-4 select-none font-display text-[140px] leading-none text-good/30"
        >
          了
        </span>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            complete · 完
          </span>
          <h2 className="font-display text-5xl leading-[1.05] text-foreground">
            Finished <em className="not-italic text-primary">encoding.</em>
          </h2>
          <div className="truncate font-mono text-xs text-muted-foreground" title={result.file}>
            {result.file}
          </div>
        </div>

        <div className="grid w-full max-w-[720px] grid-cols-4 gap-3">
          <Stat value={formatDuration(result.durationSec)} label="duration" />
          <Stat value={avgFpsLabel} label="avg fps" />
          <Stat value={formatBytes(result.bytes)} label="output size" />
          <Stat value={`${speedup}x`} label="realtime" />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button variant="ghost" onClick={handleOpenFolder}>
            <IconOpen size={12} /> Open folder
          </Button>
          <Button variant="primary" onClick={handleReset}>
            <IconPlay size={12} /> Encode another
          </Button>
        </div>
      </div>
    </section>
  );
};
