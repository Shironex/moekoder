import { useCallback, useEffect } from 'react';
import { AppShell, Sidebar, Titlebar } from '@/components/chrome';
import { CrashFallback, ErrorBoundary } from '@/components/shared';
import { Updater } from '@/components/Updater';
import {
  About,
  DoneScreen,
  EncodingScreen,
  IdleScreen,
  Onboarding,
  Settings,
  SplashScreen,
} from '@/screens';
import { useAppStore, useEncodeStore } from '@/stores';
import {
  useElectronAPI,
  useEncodeEvents,
  useEncodeTransitions,
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
  const themeId = useAppStore(s => s.themeId);
  const setThemeId = useAppStore(s => s.setThemeId);
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed);

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

  // Output filename extension. Follows the picked container with one
  // exception: `webm` falls back to `.mp4` because the backend pipeline
  // silently re-routes WebM to the MP4 muxer until v0.4 lands proper
  // VP9/AV1 support (see `buildEncodingOverrides`).
  const outputExt = container === 'mkv' ? 'mkv' : 'mp4';

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
  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const onToggleSidebar = useSidebarToggle();

  const {
    video,
    subs,
    out,
    onPickVideo,
    onPickSubs,
    onPickOut,
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
    // `EncodingSettings`. `buildEncodingOverrides` returns a narrowly typed
    // subset; cast is safe because the handler's zod schema re-validates.
    const settings = buildEncodingOverrides(hwChoice, preset, container) as Record<string, unknown>;
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
    clearLogs,
    setJobId,
    setPhase,
    setView,
  ]);

  const onEncodeAnother = useCallback((): void => {
    resetPicks();
    setView('single-idle');
  }, [resetPicks, setView]);

  const sidebar = (
    <Sidebar
      video={video}
      subs={subs}
      out={out}
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
            <IdleScreen video={video} subs={subs} out={out} />
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
          <Titlebar route="single" onSettings={() => setView('settings')} />
        )}
        {renderView()}
        <Updater />
      </div>
    </ErrorBoundary>
  );
};
