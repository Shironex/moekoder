import { lazy, Suspense, useCallback, useEffect } from 'react';
import { AppShell, Sidebar, Titlebar } from '@/components/chrome';
import { QueueSidebar } from '@/components/chrome/QueueSidebar';
import { CrashFallback, ErrorBoundary } from '@/components/shared';
import { Updater } from '@/components/Updater';
import { DoneScreen, EncodingScreen, IdleScreen, SplashScreen } from '@/screens';
import { QueueScreenContainer } from '@/screens/Queue';
import { useShallow } from 'zustand/react/shallow';
import { useQueueStore, selectStats } from '@/stores/useQueueStore';
import { useQueueEvents } from '@/hooks/useQueueEvents';
import { autoPairFiles, categorizePaths } from '@/lib/drop-helpers';
import { resolveOutputDir } from '@/lib/resolve-output';
import { stripExt } from '@/lib/paths';
import { reportQueueStartError } from '@/lib/queue-errors';

// Route-level code splitting for screens outside the hot encode path.
// Onboarding runs exactly once, Settings/About are rarely opened — keeping
// them out of the initial chunk shrinks cold-start JS by ~65-85 KB raw.
// Named-export → default wrapper (React.lazy requires a default export).
const Onboarding = lazy(() =>
  import('@/screens/onboarding').then(m => ({ default: m.Onboarding }))
);
const Settings = lazy(() => import('@/screens/Settings').then(m => ({ default: m.Settings })));
const About = lazy(() => import('@/screens/About').then(m => ({ default: m.About })));
import { useAppStore, useEncodeStore } from '@/stores';
import {
  useElectronAPI,
  useEncodeEvents,
  useEncodeTransitions,
  useFfmpegStatus,
  useFilePicks,
  useHydratedSetting,
  useSetting,
  useSidebarToggle,
} from '@/hooks';
import { applyTheme } from '@/lib/apply-theme';
import { buildEncodingOverrides } from '@/lib/encoding-overrides';
import { joinPath } from '@/lib/paths';
import { logger } from '@/lib/logger';

const log = logger('app');

/**
 * Fallback card shown when `activeView` lands on a state with no matching
 * screen — should never happen at runtime, lives here as a safety net in
 * case future store extensions introduce a view before the switch grows.
 */
const UnknownView = ({ name }: { name: string }) => (
  <div className="flex flex-1 items-center justify-center p-10">
    <div className="flex max-w-[480px] flex-col items-center gap-3 rounded-lg border border-border bg-card/30 p-10 text-center">
      <span className="font-display text-5xl text-primary">？</span>
      <h2 className="font-display text-2xl text-foreground">Unknown view</h2>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">{name}</p>
    </div>
  </div>
);

/**
 * Root application shell. Wires the foundation together:
 *   · applyTheme (DOM-only) on themeId changes
 *   · useEncodeEvents subscription at a stable mount point
 *   · activeView → screen switch with the shared AppShell layout
 *   · local file-pick state piped through to Sidebar + screens
 */
export const App = () => {
  const api = useElectronAPI();
  const activeView = useAppStore(s => s.activeView);
  const setView = useAppStore(s => s.setView);
  const route = useAppStore(s => s.route);
  const setRoute = useAppStore(s => s.setRoute);
  const themeId = useAppStore(s => s.themeId);
  const setThemeId = useAppStore(s => s.setThemeId);
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed);

  // Queue store + event subscription (single mount point for `queue:*` IPC).
  const queueStats = useQueueStore(useShallow(selectStats));
  const queueRunning = useQueueStore(s => s.running);
  const queuePaused = useQueueStore(s => s.paused);
  const queueSettings = useQueueStore(s => s.settings);
  useQueueEvents();

  const setPhase = useEncodeStore(s => s.setPhase);
  const setJobId = useEncodeStore(s => s.setJobId);
  const clearLogs = useEncodeStore(s => s.clearLogs);
  const phase = useEncodeStore(s => s.phase);

  const [hasCompletedOnboarding] = useSetting('hasCompletedOnboarding');
  const [saveTarget] = useSetting('saveTarget');
  const [customSavePath] = useSetting('customSavePath');
  const [hwChoice] = useSetting('hwChoice');
  const [preset] = useSetting('preset');
  const [container] = useSetting('container');
  const [encoding] = useSetting('encoding');
  const [queueDefaultRoute] = useSetting('queueDefaultRoute');

  // Best-effort ffmpeg version — surfaces in the Idle screen meta and in the
  // future Settings "Engine" panel. The probe runs once at mount; if it
  // fails (binary missing, ffmpeg -version times out) the screen falls back
  // to the pinned BtbN label.
  const { version: ffmpegVersion } = useFfmpegStatus();

  // Output filename extension. Prefers the container from the active
  // encoding profile (set via Settings → Encoding); falls back to the
  // legacy onboarding `container` setting so existing users are unaffected.
  const activeContainer = (encoding?.container as 'mp4' | 'mkv' | undefined) ?? container;
  const outputExt = activeContainer === 'mkv' ? 'mkv' : 'mp4';

  // Pipe the IPC encode event stream into the store once at this stable mount.
  useEncodeEvents();
  useEncodeTransitions();

  // One-shot hydration of persisted UI slices. `applyTheme` is DOM-only —
  // persistence happens at explicit user-action callsites (onboarding Theme
  // step, Settings) via `persistTheme`. If boot-time code called a persisting
  // variant, the default `themeId` would clobber the user's saved choice
  // before hydration completed.
  useHydratedSetting('themeId', themeId, setThemeId);
  useHydratedSetting('sidebarCollapsed', sidebarCollapsed, setSidebarCollapsed);
  useHydratedSetting('queueDefaultRoute', route, setRoute);
  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  // After splash, honour the persisted default route — first-run boots into
  // single-idle (the v0.2 default); a power-user who flipped
  // queueDefaultRoute to 'queue' boots straight into the queue screen.
  useEffect(() => {
    if (activeView === 'single-idle' && queueDefaultRoute === 'queue') {
      setRoute('queue');
      setView('queue');
    }
  }, [activeView, queueDefaultRoute, setRoute, setView]);

  // Keep activeView and route in sync. The user can flip route via the
  // Titlebar tabs; activeView follows. This is split from the initial
  // splash → idle flow because mid-app tab clicks need to leave settings /
  // about screens reachable from either route.
  const onRouteChange = useCallback(
    (next: 'single' | 'queue'): void => {
      setRoute(next);
      if (next === 'queue') {
        setView('queue');
      } else if (activeView === 'queue') {
        setView('single-idle');
      }
    },
    [activeView, setRoute, setView]
  );

  const onToggleSidebar = useSidebarToggle();

  const {
    video,
    subs,
    out,
    subsCandidates,
    videosCandidates,
    onPickVideo,
    onPickSubs,
    onPickOut,
    selectSubCandidate,
    selectVideoCandidate,
    applyDroppedFiles,
    reset: resetPicks,
  } = useFilePicks({ saveTarget, customSavePath, outputExt });

  const onStart = useCallback(async (): Promise<void> => {
    if (!video || !subs || !out) return;
    // Second line of defense — the sidebar already hides the button while
    // running, but a stale click (fast double-click before disable takes
    // effect) would otherwise invoke encode.start twice and get a reject
    // from the orchestrator. Short-circuit here.
    if (phase === 'running') return;
    const outputPath = joinPath(out.path, out.name);
    // `settings` at the IPC boundary is typed as a loose `Record<string,
    // unknown>` so the renderer bundle never imports the backend's
    // `EncodingSettings`. v0.4 prefers the full `encoding` profile when
    // present (set from Settings → Encoding); when absent — first launch
    // before the user opens that section — we fall back to the
    // onboarding-derived `buildEncodingOverrides` so existing user flows
    // keep working unchanged.
    const settings = encoding
      ? ({ ...encoding } as Record<string, unknown>)
      : (buildEncodingOverrides(hwChoice, preset, container) as Record<string, unknown>);
    try {
      clearLogs();
      const res = await api.encode.start({
        videoPath: video.path,
        subtitlePath: subs.path,
        outputPath,
        settings,
      });
      setJobId(res.jobId);
      setPhase('running');
      setView('single-encoding');
    } catch (err) {
      log.error('encode.start failed', err);
    }
  }, [
    api,
    video,
    subs,
    out,
    phase,
    hwChoice,
    preset,
    container,
    encoding,
    clearLogs,
    setJobId,
    setPhase,
    setView,
  ]);

  const onEncodeAnother = useCallback((): void => {
    resetPicks();
    setView('single-idle');
  }, [resetPicks, setView]);

  // Drag-and-drop into the QueueSidebar enqueues fresh pairs through the
  // same auto-pair pipeline as the screen-level drop overlay. Lives on the
  // App level so the rail doesn't need to import drop-helpers itself —
  // keeps the chrome layer presentation-only.
  const enqueueDroppedFiles = useCallback(
    (input: { paths: string[]; folderPaths?: string[] }): void => {
      const folderPath = input.folderPaths?.[0];
      const { videos, subtitles } = categorizePaths(input.paths);
      const { paired } = autoPairFiles(videos, subtitles);
      if (paired.length === 0) {
        log.warn('queue rail drop produced no auto-pairs');
        return;
      }
      const newItems = paired.map(pair => {
        const videoName = pair.video.split(/[\\/]/).pop() ?? pair.video;
        const subtitleName = pair.subtitle.split(/[\\/]/).pop() ?? pair.subtitle;
        const dir =
          folderPath ?? resolveOutputDir(saveTarget ?? 'moekoder', pair.video, customSavePath);
        const outputPath = joinPath(dir, `${stripExt(videoName)}.${outputExt}`);
        return {
          videoPath: pair.video,
          videoName,
          subtitlePath: pair.subtitle,
          subtitleName,
          outputPath,
        };
      });
      api.queue.addItems(newItems).catch(err => log.warn('queue.addItems (rail) failed', err));
    },
    [api, saveTarget, customSavePath, encoding, container]
  );

  const onQueueAddPair = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFiles({
        filters: [
          {
            name: 'Video + subtitle',
            extensions: [
              'mkv',
              'mp4',
              'm4v',
              'webm',
              'avi',
              'mov',
              'ts',
              'm2ts',
              'ass',
              'ssa',
              'srt',
              'vtt',
            ],
          },
        ],
      });
      if (res.canceled || res.filePaths.length === 0) return;
      enqueueDroppedFiles({ paths: res.filePaths });
    } catch (err) {
      log.warn('queue add-pair failed', err);
    }
  }, [api, enqueueDroppedFiles]);

  const queueSidebar = (
    <QueueSidebar
      stats={queueStats}
      running={queueRunning}
      paused={queuePaused}
      singleEncodeActive={phase === 'running'}
      concurrency={queueSettings.concurrency}
      onStart={() => api.queue.start().catch(reportQueueStartError)}
      onPause={() => api.queue.pause().catch(err => log.warn('queue.pause failed', err))}
      onResume={() => api.queue.resume().catch(err => log.warn('queue.resume failed', err))}
      onAddPair={onQueueAddPair}
      onDropFiles={enqueueDroppedFiles}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={onToggleSidebar}
    />
  );

  const sidebar = (
    <Sidebar
      video={video}
      subs={subs}
      out={out}
      outputExt={outputExt}
      onPickVideo={onPickVideo}
      onPickSubs={onPickSubs}
      onPickOut={onPickOut}
      onStart={onStart}
      encoding={phase === 'running'}
      saveTarget={saveTarget}
      hwChoice={hwChoice}
      container={container}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={onToggleSidebar}
      subsCandidates={subsCandidates}
      onSelectSubCandidate={selectSubCandidate}
      videosCandidates={videosCandidates}
      onSelectVideoCandidate={selectVideoCandidate}
    />
  );

  const renderView = (): React.ReactNode => {
    switch (activeView) {
      case 'splash':
        return (
          <SplashScreen
            onComplete={() => setView(hasCompletedOnboarding ? 'single-idle' : 'onboarding')}
          />
        );
      case 'single-idle':
        return (
          <AppShell sidebar={sidebar}>
            <IdleScreen
              video={video}
              subs={subs}
              out={out}
              ffmpegVersion={ffmpegVersion}
              onDropFiles={applyDroppedFiles}
            />
          </AppShell>
        );
      case 'single-encoding':
        return (
          <AppShell sidebar={sidebar}>
            <EncodingScreen video={video} subs={subs} out={out} />
          </AppShell>
        );
      case 'single-done':
        return (
          <AppShell sidebar={sidebar}>
            <DoneScreen onReset={onEncodeAnother} />
          </AppShell>
        );
      case 'queue':
        return (
          <AppShell sidebar={queueSidebar}>
            <QueueScreenContainer />
          </AppShell>
        );
      case 'onboarding':
        return <Onboarding />;
      case 'settings':
        return <Settings />;
      case 'about':
        return <About />;
      case 'crash':
        return <CrashFallback message="Manual crash view — use the titlebar to return." />;
      default:
        return <UnknownView name={String(activeView)} />;
    }
  };

  return (
    <ErrorBoundary
      variant="root"
      viewName="root"
      fallbackRender={({ error }) => <CrashFallback error={error} />}
    >
      <div className="app-root">
        {activeView !== 'splash' && activeView !== 'crash' && (
          <Titlebar
            route={route}
            onRouteChange={onRouteChange}
            onSettings={() => setView('settings')}
          />
        )}
        <Suspense fallback={null}>{renderView()}</Suspense>
        <Updater />
      </div>
    </ErrorBoundary>
  );
};
