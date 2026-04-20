import { IconCheck } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DL_STAGES } from '@/screens/onboarding/data';
import type { StageState } from '@/hooks/useFfmpegInstall';

interface EngineStageRailProps {
  stages: StageState[];
}

/**
 * Right rail showing the five download stages in order with per-stage status
 * (pending / active / done / error). The size column surfaces approximate
 * MB counts for the two network stages (ffmpeg + ffprobe).
 */
export const EngineStageRail = ({ stages }: EngineStageRailProps) => (
  <aside className="flex flex-col gap-2 rounded-xl border border-border bg-card/25 p-4">
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
      <span className="font-display text-base text-primary">順</span>
      <span>stages</span>
    </div>
    {DL_STAGES.map((s, i) => {
      const state = stages[i]?.status ?? 'pending';
      return (
        <div
          key={s.id}
          className={cn(
            'flex items-center gap-3 rounded-md border px-3 py-2 transition',
            state === 'done' && 'border-primary/40 bg-primary/10',
            state === 'active' && 'border-primary bg-primary/15',
            state === 'pending' && 'border-border bg-popover/30 opacity-60',
            state === 'error' && 'border-bad/50 bg-bad/10'
          )}
        >
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-display text-xs leading-none',
              state === 'done' && 'border-primary bg-primary/20 text-primary',
              state === 'active' && 'border-primary bg-primary text-primary-foreground',
              state === 'pending' && 'border-border bg-card text-muted',
              state === 'error' && 'border-bad text-bad'
            )}
            aria-hidden="true"
          >
            {state === 'done' ? <IconCheck size={11} strokeWidth={2.4} /> : s.k}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
            <b className="truncate font-display text-[12.5px] text-foreground">{s.label}</b>
            <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">
              {s.sub}
            </span>
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {state === 'done' ? '✓' : state === 'active' ? '…' : s.size ? `${s.size} mb` : '—'}
          </span>
        </div>
      );
    })}
  </aside>
);
