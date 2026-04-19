import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button, IconCheck, IconTerminal } from '@/components/ui';
import { useElectronAPI } from '@/hooks';
import { cn } from '@/lib/cn';
import type { InstallProgress, InstallStage } from '@/types/electron-api';
import { DL_STAGES, DL_STAGE_FOR_UPSTREAM, type DlStage } from '../data';

interface EngineProps {
  /**
   * Called when ffmpeg is either confirmed installed or finishes downloading.
   * Flips the parent's `canNext` on so the user can advance.
   */
  onReady: (version: string | null) => void;
}

type LogLevel = 'info' | 'ok' | 'warn' | 'err' | 'dl';

interface LogEntry {
  t: string;
  level: LogLevel;
  msg: React.ReactNode;
}

type StageStatus = 'pending' | 'active' | 'done' | 'error';

interface StageState {
  id: DlStage['id'];
  status: StageStatus;
}

const fmtTime = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const fmtMB = (bytes: number | undefined): string => {
  if (!bytes || bytes <= 0) return '0.0';
  return (bytes / 1024 / 1024).toFixed(1);
};

const LOG_LEVEL_CLASS: Record<LogLevel, string> = {
  info: 'text-muted-foreground',
  ok: 'text-good',
  warn: 'text-warn',
  err: 'text-bad',
  dl: 'text-primary',
};

/**
 * Step 02 · Engine. Ensures ffmpeg + ffprobe are installed on the user's
 * machine. Runs `isInstalled()` once on mount — if the binaries are already
 * there, the step shows a confirmation card and reports ready immediately.
 * Otherwise kicks off `ensureBinaries()` and mirrors `onDownloadProgress`
 * events into a live stage rail + terminal log.
 */
export const Engine = ({ onReady }: EngineProps) => {
  const api = useElectronAPI();

  const [stages, setStages] = useState<StageState[]>(() =>
    DL_STAGES.map(s => ({ id: s.id, status: 'pending' }))
  );
  const [log, setLog] = useState<LogEntry[]>([]);
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [phase, setPhase] = useState<
    'probing' | 'needs-install' | 'running' | 'done' | 'error' | 'already'
  >('probing');
  const [version, setVersion] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Latest-known stage index + version snapshot, read from inside the async
  // install pipeline so `start()` doesn't need them in its dep array.
  const activeStageIdxRef = useRef(0);
  useEffect(() => {
    activeStageIdxRef.current = activeStageIdx;
  }, [activeStageIdx]);
  const versionRef = useRef<string | null>(null);
  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  // Mutex so re-mounts (StrictMode double-invoke, rapid retries) don't fire
  // overlapping ensureBinaries calls — the manager API is happy to queue,
  // but duplicate log entries are confusing for the user.
  const inFlightRef = useRef(false);

  // Dedupe key for the last log line we emitted from a progress event. The
  // main process can fire dozens of `downloading` ticks at the same rounded
  // pct; we bucket those into 10% steps so the log reads as milestones
  // instead of spam. State-change stages (resolving / verifying / extracting
  // / installing / done) are always let through on transition.
  const lastLogSigRef = useRef<string>('');

  // Scroll container for the install log — pinned to the bottom on append so
  // the newest line stays visible while stages progress.
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((level: LogLevel, msg: React.ReactNode): void => {
    setLog(l => [...l, { t: fmtTime(), level, msg }]);
  }, []);

  useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log]);

  const handleProgress = useCallback((p: InstallProgress): void => {
    // Map upstream stage onto the visual stage registry.
    const visualId: DlStage['id'] = DL_STAGE_FOR_UPSTREAM[p.stage];
    const visualIdx = DL_STAGES.findIndex(s => s.id === visualId);
    if (visualIdx >= 0) {
      setActiveStageIdx(visualIdx);
      setStages(prev =>
        prev.map((s, i) => ({
          id: s.id,
          status: i < visualIdx ? 'done' : i === visualIdx ? 'active' : 'pending',
        }))
      );
    }

    setPct(Math.min(100, Math.round(p.pct * 100)));
    if (typeof p.downloadedBytes === 'number') setDownloadedBytes(p.downloadedBytes);
    if (typeof p.totalBytes === 'number') setTotalBytes(p.totalBytes);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setErrorMsg(null);
    setPhase('running');
    setStages(DL_STAGES.map((s, i) => ({ id: s.id, status: i === 0 ? 'active' : 'pending' })));
    setActiveStageIdx(0);
    setPct(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    lastLogSigRef.current = '';
    appendLog('info', 'Starting ffmpeg install pipeline…');

    const unsub = api.ffmpeg.onDownloadProgress(p => {
      const upstreamMessages: Partial<Record<InstallStage, { level: LogLevel; text: string }>> = {
        resolving: { level: 'info', text: p.message ?? 'Resolving ffmpeg source' },
        downloading: {
          level: 'dl',
          text: p.message ?? `Downloading ${Math.round(p.pct * 100)}%`,
        },
        verifying: { level: 'info', text: p.message ?? 'Verifying SHA-256' },
        extracting: { level: 'info', text: p.message ?? 'Extracting archive' },
        installing: { level: 'ok', text: p.message ?? 'Installing to AppData' },
        done: { level: 'ok', text: p.message ?? 'ffmpeg ready' },
      };
      const entry = upstreamMessages[p.stage];
      if (entry) {
        // Bucket `downloading` logs into 10% milestones (+0, +100 always
        // allowed) so a fast connection doesn't spam the terminal; other
        // stages dedupe by (stage, message) so identical transitions only
        // log once.
        const sig =
          p.stage === 'downloading'
            ? `dl:${Math.min(100, Math.floor(Math.round(p.pct * 100) / 10) * 10)}:${entry.text}`
            : `${p.stage}:${entry.text}`;
        if (sig !== lastLogSigRef.current) {
          lastLogSigRef.current = sig;
          appendLog(entry.level, entry.text);
        }
      }
      handleProgress(p);
    });

    try {
      await api.ffmpeg.ensureBinaries();
      unsub();
      // Post-install: confirm + read version.
      try {
        const v = await api.ffmpeg.getVersion();
        setVersion(v);
        appendLog('ok', v ? `ffmpeg version: ${v}` : 'ffmpeg installed');
      } catch {
        // non-fatal
      }
      setStages(prev => prev.map(s => ({ ...s, status: 'done' })));
      setActiveStageIdx(DL_STAGES.length - 1);
      setPct(100);
      setPhase('done');
      onReadyRef.current(versionRef.current);
      appendLog('ok', 'All stages complete — engine ready.');
    } catch (err) {
      unsub();
      const message = err instanceof Error ? err.message : String(err);
      console.error('[onboarding/engine] ensureBinaries failed', err);
      setErrorMsg(message);
      setPhase('error');
      const crashedIdx = activeStageIdxRef.current;
      setStages(prev =>
        prev.map((s, i) => ({
          id: s.id,
          status: i < crashedIdx ? 'done' : i === crashedIdx ? 'error' : 'pending',
        }))
      );
      appendLog('err', message);
    } finally {
      inFlightRef.current = false;
    }
  }, [api, appendLog, handleProgress]);

  // Boot probe — decide whether to skip or kick the installer.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const installed = await api.ffmpeg.isInstalled();
        if (cancelled) return;
        if (installed) {
          let v: string | null = null;
          try {
            v = await api.ffmpeg.getVersion();
          } catch {
            // ignore
          }
          if (cancelled) return;
          setVersion(v);
          setStages(DL_STAGES.map(s => ({ id: s.id, status: 'done' })));
          setActiveStageIdx(DL_STAGES.length - 1);
          setPct(100);
          setPhase('already');
          appendLog(
            'ok',
            v ? `ffmpeg already installed · ${v}` : 'ffmpeg already installed in AppData'
          );
          onReadyRef.current(v);
          return;
        }
        // Do NOT auto-start the download: show the user a gate explaining
        // what's about to happen and let them click "Install" when ready.
        setPhase('needs-install');
        appendLog('info', 'ffmpeg not found in AppData — waiting for user to start install.');
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[onboarding/engine] probe failed', err);
        setErrorMsg(message);
        setPhase('error');
        appendLog('err', message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, appendLog, start]);

  const retry = useCallback((): void => {
    setLog([]);
    void start();
  }, [start]);

  // Derived values — computed *before* the early return so every render walks
  // through the same hook sequence (Rules of Hooks: identical hook order each
  // render, regardless of which branch we later render).
  const activeStage = DL_STAGES[Math.min(activeStageIdx, DL_STAGES.length - 1)];
  const busyHeadline = useMemo(() => {
    if (phase === 'already') return 'Already installed.';
    if (phase === 'done') return 'Engine ready.';
    if (phase === 'error') return 'Download failed.';
    return activeStage.label;
  }, [phase, activeStage]);

  // Gate screen shown on first launch before the user confirms the download.
  // Splitting this out of the main layout keeps the "we're about to do a
  // thing" moment distinct from the "we're doing the thing" progress view.
  if (phase === 'probing' || phase === 'needs-install') {
    const probing = phase === 'probing';
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          <span className="font-display text-lg text-primary">引</span>
          <span>step 02 · engine</span>
          <span className="h-1 w-1 rounded-full bg-muted/50" />
          <span>ffmpeg + ffprobe</span>
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="font-display text-4xl leading-tight text-foreground">
            {probing ? (
              <>
                Checking the <em className="not-italic text-primary">engine…</em>
              </>
            ) : (
              <>
                We need a couple of <em className="not-italic text-primary">tools.</em>
              </>
            )}
          </h1>
          <p className="max-w-[640px] text-sm leading-relaxed text-muted-foreground">
            MoeKoder runs on <b className="text-foreground">ffmpeg + ffprobe</b> — the open-source
            tools that decode video, burn subtitles, and mux the output. We fetch the official{' '}
            <b className="text-foreground">BtbN ffmpeg</b> build, verify it, and drop the binaries
            in your AppData. One-time, around <b className="text-foreground">~180 MB</b>, then never
            again.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-5">
          <div className="flex items-center gap-3">
            <span className="font-display text-3xl leading-none text-primary">具</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="font-display text-base text-foreground">What we&apos;ll install</b>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                destination · %LOCALAPPDATA%\moekoder\bin
              </span>
            </div>
          </div>
          <ul className="flex flex-col gap-2 font-mono text-[11.5px] text-muted-foreground">
            <li className="flex items-center gap-3">
              <span className="font-display text-primary">録</span>
              <b className="font-sans text-[13px] text-foreground">ffmpeg.exe</b>
              <span className="text-muted">· encodes video, burns subtitles</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="font-display text-primary">測</span>
              <b className="font-sans text-[13px] text-foreground">ffprobe.exe</b>
              <span className="text-muted">· reads duration, streams, attachments</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="font-display text-primary">印</span>
              <b className="font-sans text-[13px] text-foreground">sha-256 verify</b>
              <span className="text-muted">· tamper check before install</span>
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
            {probing ? 'looking for an existing install…' : 'ready when you are'}
          </span>
          <Button
            variant="primary"
            size="lg"
            disabled={probing}
            onClick={() => {
              void start();
            }}
          >
            <Download size={15} />
            {probing ? 'Checking…' : 'Install ffmpeg'}
          </Button>
        </div>
      </div>
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
          {/* Progress card */}
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
                  {fmtMB(downloadedBytes)} / {totalBytes > 0 ? fmtMB(totalBytes) : '—'} MB
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

          {/* Terminal log */}
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
              ref={logScrollRef}
              className="max-h-[240px] overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-5"
            >
              {log.length === 0 ? (
                <div className="text-muted">Waiting for install events…</div>
              ) : (
                log.map((line, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="shrink-0 text-muted">{line.t}</span>
                    <span
                      className={cn(
                        'shrink-0 uppercase tracking-[0.18em]',
                        LOG_LEVEL_CLASS[line.level]
                      )}
                    >
                      {line.level}
                    </span>
                    <span className="min-w-0 text-foreground">{line.msg}</span>
                  </div>
                ))
              )}
              {phase === 'running' && (
                <div className="flex gap-3">
                  <span className="shrink-0 text-muted">{fmtTime()}</span>
                  <span className="shrink-0 uppercase tracking-[0.18em] text-primary">dl</span>
                  <span className="text-foreground">
                    {activeStage.label.toLowerCase()}{' '}
                    <span className="inline-block w-[0.5ch] animate-pulse">▊</span>
                  </span>
                </div>
              )}
            </div>
          </div>

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

        {/* Right rail — stage list */}
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
                  {state === 'done'
                    ? '✓'
                    : state === 'active'
                      ? '…'
                      : s.size
                        ? `${s.size} mb`
                        : '—'}
                </span>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
};
