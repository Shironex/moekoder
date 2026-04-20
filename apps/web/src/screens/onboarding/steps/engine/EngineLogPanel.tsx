import { useEffect, useRef } from 'react';
import { IconTerminal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatClockTime } from '@/lib/format';
import type { DlStage } from '@/screens/onboarding/data';
import type { FfmpegInstallPhase, LogEntry, LogLevel } from '@/hooks/useFfmpegInstall';

const LOG_LEVEL_CLASS: Record<LogLevel, string> = {
  info: 'text-muted-foreground',
  ok: 'text-good',
  warn: 'text-warn',
  err: 'text-bad',
  dl: 'text-primary',
};

interface EngineLogPanelProps {
  log: LogEntry[];
  phase: FfmpegInstallPhase;
  activeStage: DlStage;
}

/**
 * Terminal-styled install log. Auto-scrolls to the latest entry on each
 * append and shows a pulsing bullet line while the install is running.
 */
export const EngineLogPanel = ({ log, phase, activeStage }: EngineLogPanelProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-popover/70">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <IconTerminal size={13} className="text-primary" aria-hidden="true" />
        <span>engine · install log</span>
        <div className="flex-1" />
        <span className={cn(phase === 'error' ? 'text-bad' : 'text-primary')}>
          {phase === 'done' || phase === 'already'
            ? 'complete'
            : phase === 'error'
              ? 'error'
              : 'running'}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[240px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-5"
      >
        {log.length === 0 ? (
          <div className="text-muted">Waiting for install events…</div>
        ) : (
          log.map((line, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 text-muted">{line.t}</span>
              <span
                className={cn('shrink-0 uppercase tracking-[0.18em]', LOG_LEVEL_CLASS[line.level])}
              >
                {line.level}
              </span>
              <span className="min-w-0 text-foreground">{line.msg}</span>
            </div>
          ))
        )}
        {phase === 'running' && (
          <div className="flex gap-3">
            <span className="shrink-0 text-muted">{formatClockTime()}</span>
            <span className="shrink-0 uppercase tracking-[0.18em] text-primary">dl</span>
            <span className="text-foreground">
              {activeStage.label.toLowerCase()}{' '}
              <span className="inline-block w-[0.5ch] animate-pulse">▊</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
