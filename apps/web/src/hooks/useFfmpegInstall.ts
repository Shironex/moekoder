import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { InstallProgress, InstallStage } from '@/types/electron-api';
import { formatClockTime } from '@/lib/format';
import { logger } from '@/lib/logger';
import { DL_STAGES, DL_STAGE_FOR_UPSTREAM, type DlStage } from '@/screens/onboarding/data';
import { useElectronAPI } from './useElectronAPI';

const log = logger('useFfmpegInstall');

export type FfmpegInstallPhase =
  | 'probing'
  | 'needs-install'
  | 'running'
  | 'done'
  | 'error'
  | 'already';

export type LogLevel = 'info' | 'ok' | 'warn' | 'err' | 'dl';

export interface LogEntry {
  t: string;
  level: LogLevel;
  msg: ReactNode;
}

type StageStatus = 'pending' | 'active' | 'done' | 'error';

export interface StageState {
  id: DlStage['id'];
  status: StageStatus;
}

export interface FfmpegInstallProbe {
  installed: boolean;
  version: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

interface UseFfmpegInstallOptions {
  probe: FfmpegInstallProbe;
  /** Called when ffmpeg is confirmed installed (either already present or just finished). */
  onReady: (version: string | null) => void;
}

export interface FfmpegInstallHook {
  phase: FfmpegInstallPhase;
  stages: StageState[];
  pct: number;
  downloadedBytes: number;
  totalBytes: number;
  log: LogEntry[];
  activeStage: DlStage;
  version: string | null;
  errorMsg: string | null;
  start: () => Promise<void>;
  retry: () => void;
}

/**
 * State machine + IPC wiring for the onboarding Engine step. Mirrors the
 * main-process `ffmpeg/manager` install pipeline:
 *   probing → needs-install → running → done
 *                                   ↘ error → (retry) → running …
 * Or short-circuits through `already` when the probe reports binaries
 * are already present.
 *
 * The hook owns: stage transitions, progress accumulation, log dedupe,
 * and the post-install `probe.refresh()` call. The component only renders
 * whatever shape the returned state dictates.
 */
export const useFfmpegInstall = ({
  probe,
  onReady,
}: UseFfmpegInstallOptions): FfmpegInstallHook => {
  const api = useElectronAPI();

  // Derive every piece of initial state from the probe. When the parent's
  // probe has already resolved (common case — user spends >100ms on Welcome
  // before reaching step 2), we open directly in `already` or
  // `needs-install` with matching stages/log, no "Checking…" flash.
  const preloadedInstalled = !probe.loading && probe.installed;
  const preloadedMissing = !probe.loading && !probe.installed;

  const [stages, setStages] = useState<StageState[]>(() =>
    DL_STAGES.map(s => ({
      id: s.id,
      status: preloadedInstalled ? 'done' : 'pending',
    }))
  );
  const [logEntries, setLogEntries] = useState<LogEntry[]>(() => {
    const t = formatClockTime();
    if (preloadedInstalled) {
      return [
        {
          t,
          level: 'ok',
          msg: probe.version
            ? `ffmpeg already installed · ${probe.version}`
            : 'ffmpeg already installed in AppData',
        },
      ];
    }
    if (preloadedMissing) {
      return [
        {
          t,
          level: 'info',
          msg: 'ffmpeg not found in AppData — waiting for user to start install.',
        },
      ];
    }
    return [];
  });
  const [activeStageIdx, setActiveStageIdx] = useState(
    preloadedInstalled ? DL_STAGES.length - 1 : 0
  );
  const [pct, setPct] = useState(preloadedInstalled ? 100 : 0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [phase, setPhase] = useState<FfmpegInstallPhase>(() => {
    if (probe.loading) return 'probing';
    return probe.installed ? 'already' : 'needs-install';
  });
  const [version, setVersion] = useState<string | null>(preloadedInstalled ? probe.version : null);
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
  // overlapping ensureBinaries calls.
  const inFlightRef = useRef(false);

  // Dedupe key for the last log line we emitted from a progress event. Fast
  // connections would otherwise fire dozens of `downloading` events at the
  // same rounded pct; we bucket those into 10% steps.
  const lastLogSigRef = useRef<string>('');

  const appendLog = useCallback((level: LogLevel, msg: ReactNode): void => {
    setLogEntries(l => [...l, { t: formatClockTime(), level, msg }]);
  }, []);

  const handleProgress = useCallback((p: InstallProgress): void => {
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
      // Refresh the parent's probe so navigation back reflects the install.
      void probe.refresh();
      appendLog('ok', 'All stages complete — engine ready.');
    } catch (err) {
      unsub();
      const message = err instanceof Error ? err.message : String(err);
      log.error('ensureBinaries failed', err);
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
  }, [api, appendLog, handleProgress, probe]);

  // Fire `onReady` exactly once on mount when ffmpeg is already installed.
  const readyFiredRef = useRef(false);
  useEffect(() => {
    if (readyFiredRef.current) return;
    if (probe.loading) return;
    if (!probe.installed) return;
    readyFiredRef.current = true;
    onReadyRef.current(probe.version);
  }, [probe.loading, probe.installed, probe.version]);

  // Slow-probe transition — only while phase === 'probing'.
  useEffect(() => {
    if (phase !== 'probing') return;
    if (probe.loading) return;
    if (probe.installed) {
      setVersion(probe.version);
      setStages(DL_STAGES.map(s => ({ id: s.id, status: 'done' })));
      setActiveStageIdx(DL_STAGES.length - 1);
      setPct(100);
      setPhase('already');
      appendLog(
        'ok',
        probe.version
          ? `ffmpeg already installed · ${probe.version}`
          : 'ffmpeg already installed in AppData'
      );
      onReadyRef.current(probe.version);
      readyFiredRef.current = true;
    } else {
      setPhase('needs-install');
      appendLog('info', 'ffmpeg not found in AppData — waiting for user to start install.');
    }
  }, [phase, probe.loading, probe.installed, probe.version, appendLog]);

  const retry = useCallback((): void => {
    setLogEntries([]);
    void start();
  }, [start]);

  const activeStage = DL_STAGES[Math.min(activeStageIdx, DL_STAGES.length - 1)];

  return {
    phase,
    stages,
    pct,
    downloadedBytes,
    totalBytes,
    log: logEntries,
    activeStage,
    version,
    errorMsg,
    start,
    retry,
  };
};
