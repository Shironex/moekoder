import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Sidebar, Titlebar, type PickedFile } from '@/components/chrome';
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
import { useElectronAPI, useEncodeEvents, useSetting } from '@/hooks';
import { applyTheme } from '@/lib/apply-theme';
import { buildEncodingOverrides } from '@/lib/encoding-overrides';
import { basename, extOf, joinPath, stripExt } from '@/lib/paths';
import { logger } from '@/lib/logger';
import { resolveOutputDir } from '@/lib/resolve-output';
// `applyTheme` is DOM-only — persistence happens at explicit user-action
// callsites (onboarding Theme step, Settings) via `persistTheme`. If this
// boot-time effect called a persisting variant, the default `themeId` would
// clobber the user's saved choice before `useSetting` could hydrate it.

const log = logger('app');

const VIDEO_FILTERS = [
  { name: 'Video', extensions: ['mkv', 'mp4', 'mov', 'avi', 'webm', 'm4v'] },
  { name: 'All files', extensions: ['*'] },
];
const SUB_FILTERS = [
  { name: 'Subtitle', extensions: ['ass', 'ssa', 'srt'] },
  { name: 'All files', extensions: ['*'] },
];

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

  const setPhase = useEncodeStore(s => s.setPhase);
  const setJobId = useEncodeStore(s => s.setJobId);
  const clearLogs = useEncodeStore(s => s.clearLogs);
  const resetEncode = useEncodeStore(s => s.reset);
  const phase = useEncodeStore(s => s.phase);

  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore(s => s.setSidebarCollapsed);

  const [persistedTheme] = useSetting('themeId');
  const [hasCompletedOnboarding] = useSetting('hasCompletedOnboarding');
  // Save preference chosen in onboarding — drives the auto-populated output
  // folder when the user picks a video. `null` until useSetting hydrates from
  // electron-store; the pick handler gates on that.
  const [saveTarget] = useSetting('saveTarget');
  const [customSavePath] = useSetting('customSavePath');
  // Encode picks from onboarding — consumed by `onStart` to shape the
  // `encode:start` settings override, and by the file-pick handlers to
  // derive the correct output filename extension.
  const [hwChoice] = useSetting('hwChoice');
  const [preset] = useSetting('preset');
  const [container] = useSetting('container');
  const [persistedSidebarCollapsed] = useSetting('sidebarCollapsed');

  // Output filename extension. Follows the picked container with one
  // exception: `webm` falls back to `.mp4` because the backend pipeline
  // silently re-routes WebM to the MP4 muxer until v0.4 lands proper
  // VP9/AV1 support (see `buildEncodingOverrides`).
  const outputExt = container === 'mkv' ? 'mkv' : 'mp4';

  // Pipe the IPC encode event stream into the store once at this stable mount.
  useEncodeEvents();

  // File-pick state. Local to the app for v0.1; promote to a store if it
  // needs to be read from multiple distant branches later.
  const [video, setVideo] = useState<PickedFile | null>(null);
  const [subs, setSubs] = useState<PickedFile | null>(null);
  const [out, setOut] = useState<{ name: string; path: string } | null>(null);

  // Sync persisted themeId into the app store exactly once on initial
  // hydration. `useSetting` is one-shot (it doesn't poll), so `persistedTheme`
  // stays at its initial value for the rest of the session. Without this ref
  // guard, picking a new theme would re-fire this effect (via `themeId` in
  // the dep array), see persistedTheme still holding the stale initial value,
  // and silently revert the user's choice.
  const hydratedThemeRef = useRef(false);
  useEffect(() => {
    if (hydratedThemeRef.current) return;
    if (!persistedTheme) return;
    hydratedThemeRef.current = true;
    if (persistedTheme !== themeId) {
      setThemeId(persistedTheme);
    }
  }, [persistedTheme, themeId, setThemeId]);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  // Mirror of the themeId hydration pattern: one-shot sync from electron-store
  // into the in-memory store, guarded by a ref so subsequent user toggles
  // aren't clobbered by the stale initial read that `useSetting` keeps around
  // for the rest of the session.
  const hydratedSidebarRef = useRef(false);
  useEffect(() => {
    if (hydratedSidebarRef.current) return;
    if (persistedSidebarCollapsed === null) return;
    hydratedSidebarRef.current = true;
    if (persistedSidebarCollapsed !== sidebarCollapsed) {
      setSidebarCollapsed(persistedSidebarCollapsed);
    }
  }, [persistedSidebarCollapsed, sidebarCollapsed, setSidebarCollapsed]);

  const onToggleSidebar = useCallback(async (): Promise<void> => {
    // Read from the store directly so concurrent toggles (edge handle click
    // landing in the same frame as the hotkey) don't both flip off the same
    // stale snapshot value.
    const next = !useAppStore.getState().sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      await api.store.set('sidebarCollapsed', next);
    } catch (err) {
      log.warn('sidebar persist failed', err);
    }
  }, [api, setSidebarCollapsed]);

  // Ctrl/Cmd+B hotkey. Suppressed while the user is typing into a form control
  // and on shell views that don't render a sidebar at all (splash/onboarding/
  // crash) so the keypress stays a normal `b` character everywhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'b') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (activeView === 'splash' || activeView === 'onboarding' || activeView === 'crash') return;
      e.preventDefault();
      void onToggleSidebar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeView, onToggleSidebar]);

  // Advance the shell view when the encode reaches a terminal phase. Running
  // the transition here (rather than inside useEncodeEvents) keeps the
  // event hook purely "IPC → store" and leaves route control on App.
  useEffect(() => {
    if (activeView !== 'single-encoding') return;
    if (phase === 'done') {
      setView('single-done');
    } else if (phase === 'cancelled') {
      // User-initiated cancel: wipe encode state and slide back to idle so
      // the pipeline is immediately ready for the next job.
      resetEncode();
      setView('single-idle');
    }
  }, [phase, activeView, setView, resetEncode]);

  const onPickVideo = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: VIDEO_FILTERS });
      if (res.canceled || !res.filePath) return;
      const name = basename(res.filePath);
      setVideo({ name, path: res.filePath, ext: extOf(res.filePath) });

      // Auto-populate the output target from the onboarding save preference.
      // The user can still click the Output stage to override. Skipped until
      // `useSetting('saveTarget')` hydrates so we never derive against a
      // stale default on first paint.
      if (saveTarget) {
        const outputDir = resolveOutputDir(saveTarget, res.filePath, customSavePath);
        const outputName = `${stripExt(name)}.${outputExt}`;
        setOut({ name: outputName, path: outputDir });
      }
    } catch (err) {
      log.error('dialog.openFile video failed', err);
    }
  }, [api, saveTarget, customSavePath, outputExt]);

  const onPickSubs = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: SUB_FILTERS });
      if (res.canceled || !res.filePath) return;
      const name = basename(res.filePath);
      setSubs({ name, path: res.filePath, ext: extOf(res.filePath) });
    } catch (err) {
      log.error('dialog.openFile subs failed', err);
    }
  }, [api]);

  const onPickOut = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFolder({});
      if (res.canceled || !res.folderPath) return;
      const baseName = video ? `${stripExt(video.name)}.${outputExt}` : `output.${outputExt}`;
      setOut({ name: baseName, path: res.folderPath });
    } catch (err) {
      log.error('dialog.openFolder failed', err);
    }
  }, [api, video, outputExt]);

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
    // Reset the picks so the user truly starts fresh. The encode store is
    // reset by DoneScreen itself via the `reset()` selector.
    setVideo(null);
    setSubs(null);
    setOut(null);
    setView('single-idle');
  }, [setView]);

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
