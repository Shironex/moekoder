import { useEffect, useRef, useState } from 'react';
import {
  Filmstrip,
  IconBitrate,
  IconClock,
  IconClose,
  IconFilm,
  IconGauge,
  IconPause,
  IconPlay,
  IconTerminal,
  LogLine,
  Metric,
  PageHead,
  Ring,
} from '@/components/ui';
import { Button } from '@/components/ui';
import { useElectronAPI } from '@/hooks';
import { useEncodeStore, type EncodeLogLine } from '@/stores';
import type { PickedFile } from '@/components/chrome';
import { cn } from '@/lib/cn';

interface EncodingProps {
  video: PickedFile | null;
  subs: PickedFile | null;
  out: { name: string; path: string } | null;
}

/**
 * Format seconds as `m:ss` / `h:mm:ss`. Input that isn't finite collapses
 * to `--:--` so the ring / metric row never shows `NaN:NaN`.
 */
const formatDuration = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return '--:--';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
};

const formatTimestamp = (ms: number): string => {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms3 = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms3}`;
};

interface LogPanelProps {
  logs: EncodeLogLine[];
  open: boolean;
  onToggle: () => void;
}

const LogPanel = ({ logs, open, onToggle }: LogPanelProps) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entry. Reading `logs.length` keeps the effect
  // dependency trackable without subscribing to the full array identity.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [logs.length]);

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-md border border-border bg-card/60 transition-all',
        open ? 'w-[420px]' : 'w-[60px]'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 items-center gap-2 border-b border-border px-3 text-left hover:bg-card"
        title={open ? 'Collapse log' : 'Expand log'}
      >
        <span className="font-display text-base text-primary">録</span>
        {open ? (
          <>
            <span className="font-display text-sm text-foreground">ffmpeg · stderr</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              {logs.length} lines
            </span>
          </>
        ) : (
          <IconTerminal size={14} className="text-muted" />
        )}
      </button>

      {open && (
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {logs.map((l, i) => (
            <LogLine key={`${l.ts}-${i}`} ts={formatTimestamp(l.ts)} lvl={l.level} text={l.text} />
          ))}
          {logs.length === 0 && (
            <div className="py-6 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              waiting · stderr idle
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Encoding screen. Driven entirely by `useEncodeStore`. Pause toggles phase
 * locally (the main-process orchestrator treats `paused` as informational
 * until v0.2 adds real process-level pause). Cancel aborts via IPC.
 */
export const EncodingScreen = ({ video, subs, out }: EncodingProps) => {
  const api = useElectronAPI();
  const phase = useEncodeStore(s => s.phase);
  const progress = useEncodeStore(s => s.progress);
  const logs = useEncodeStore(s => s.logs);
  const jobId = useEncodeStore(s => s.jobId);
  const setPhase = useEncodeStore(s => s.setPhase);

  const [logOpen, setLogOpen] = useState(true);

  const paused = phase === 'paused';
  const elapsed = formatDuration(progress.outTimeSec);
  const eta = formatDuration(progress.etaSec);

  const handlePauseToggle = (): void => {
    setPhase(paused ? 'running' : 'paused');
  };

  const handleCancel = async (): Promise<void> => {
    if (!jobId) return;
    try {
      await api.encode.cancel(jobId);
    } catch (err) {
      console.error('[encode:cancel] failed', err);
    }
  };

  return (
    <section className="relative flex flex-1 flex-col gap-6 overflow-hidden px-10 py-8">
      <PageHead
        screen="encoding"
        route="single"
        title="Encoding. Stay cozy."
        right={
          <div className="flex flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            <span className={paused ? 'text-warn' : 'text-good'}>
              {paused ? 'paused' : 'live'} · ffmpeg
            </span>
            <span className="text-foreground">
              <b>{video?.name ?? '—'}</b>
            </span>
            <span>→ {out?.name ?? '—.mp4'}</span>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Hero column */}
        <div className="flex min-w-0 flex-1 flex-col gap-5 rounded-lg border border-border bg-card/30 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-sm border border-border bg-popover px-2.5 py-1">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  paused ? 'bg-warn' : 'animate-pulse bg-good'
                )}
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
                {paused ? 'paused' : 'transcoding'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handlePauseToggle}>
                {paused ? (
                  <>
                    <IconPlay size={12} /> Resume
                  </>
                ) : (
                  <>
                    <IconPause size={12} /> Pause
                  </>
                )}
              </Button>
              <Button variant="danger" size="sm" onClick={handleCancel}>
                <IconClose size={12} /> Cancel
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-8">
            <Ring pct={progress.pct} eta={eta} />
            <div className="flex min-w-0 flex-1 flex-col gap-3 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="font-display text-xl text-primary">映</span>
                <span className="truncate text-foreground" title={video?.name}>
                  {video?.name ?? 'source.mkv'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl text-primary">字</span>
                <span className="truncate text-foreground" title={subs?.name}>
                  {subs?.name ?? 'subs.ass'}
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted">↓ burning ↓</div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl text-good">出</span>
                <span className="truncate text-foreground" title={out?.name}>
                  {out?.name ?? 'output.mp4'}
                </span>
              </div>
            </div>
          </div>

          <Filmstrip pct={progress.pct} count={14} />

          <div className="grid grid-cols-4 gap-3">
            <Metric icon={IconFilm} label="FPS" value={progress.fps.toFixed(0)} />
            <Metric icon={IconGauge} label="Speed" value={progress.speed.toFixed(1)} unit="x" />
            <Metric
              icon={IconBitrate}
              label="Bitrate"
              value={(progress.bitrateKbps / 1000).toFixed(1)}
              unit="Mb/s"
            />
            <Metric icon={IconClock} label="Elapsed" value={elapsed} />
          </div>
        </div>

        {/* Log column */}
        <LogPanel logs={logs} open={logOpen} onToggle={() => setLogOpen(o => !o)} />
      </div>
    </section>
  );
};
