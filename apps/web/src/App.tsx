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
// `applyTheme` is DOM-only. Persistence happens at explicit user-action
// callsites (onboarding Theme step, Settings) via `persistTheme`.

/**
 * Extract a trailing filename from a path using both `/` and `\` as
 * separators so Windows and POSIX shells both work. Falls back to the input
 * when no separator is present.
 */
const basename = (p: string): string => {
  const segs = p.split(/[\\/]/);
  return segs[segs.length - 1] || p;
};

/**
 * Extension (without dot), derived from the tail of the filename. Empty when
 * the filename has no extension.
 */
const extOf = (p: string): string | undefined => {
  const name = basename(p);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
};

/**
 * Strip the extension from a filename. Used when composing the default
 * output name from the video source.
 */
const stripExt = (name: string): string => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  return name.slice(0, dot);
};

/**
 * Join an output directory with a filename using the platform-appropriate
 * separator (inferred from the directory itself so we don't pull `path` in).
 */
const joinPath = (dir: string, file: string): string => {
  if (!dir) return file;
  const sep = dir.includes('\\') ? '\\' : '/';
  const trimmed = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir;
  return `${trimmed}${sep}${file}`;
};

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
 *   · applyTheme on themeId changes (persisted + in-memory)
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
  const phase = useEncodeStore(s => s.phase);

  const [persistedTheme] = useSetting('themeId');
  const [hasCompletedOnboarding] = useSetting('hasCompletedOnboarding');

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
    void applyTheme(themeId);
  }, [themeId]);

  // Advance the shell view when the encode reaches a terminal phase. Running
  // the transition here (rather than inside useEncodeEvents) keeps the
  // event hook purely "IPC → store" and leaves route control on App.
  useEffect(() => {
    if (phase === 'done' && activeView === 'single-encoding') {
      setView('single-done');
    }
  }, [phase, activeView, setView]);

  const onPickVideo = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: VIDEO_FILTERS });
      if (res.canceled || !res.filePath) return;
      const name = basename(res.filePath);
      setVideo({ name, path: res.filePath, ext: extOf(res.filePath) });
    } catch (err) {
      console.error('[dialog.openFile video] failed', err);
    }
  }, [api]);

  const onPickSubs = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: SUB_FILTERS });
      if (res.canceled || !res.filePath) return;
      const name = basename(res.filePath);
      setSubs({ name, path: res.filePath, ext: extOf(res.filePath) });
    } catch (err) {
      console.error('[dialog.openFile subs] failed', err);
    }
  }, [api]);

  const onPickOut = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFolder({});
      if (res.canceled || !res.folderPath) return;
      const baseName = video ? `${stripExt(video.name)}.mp4` : 'output.mp4';
      setOut({ name: baseName, path: res.folderPath });
    } catch (err) {
      console.error('[dialog.openFolder] failed', err);
    }
  }, [api, video]);

  const onStart = useCallback(async (): Promise<void> => {
    if (!video || !subs || !out) return;
    const outputPath = joinPath(out.path, out.name);
    try {
      clearLogs();
      const res = await api.encode.start({
        videoPath: video.path,
        subtitlePath: subs.path,
        outputPath,
      });
      setJobId(res.jobId);
      setPhase('running');
      setView('single-encoding');
    } catch (err) {
      console.error('[encode.start] failed', err);
    }
  }, [api, video, subs, out, clearLogs, setJobId, setPhase, setView]);

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
