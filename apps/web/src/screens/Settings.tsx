import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, FolderOpen, Info, RefreshCw, RotateCcw } from 'lucide-react';
import { APP_NAME, GITHUB_REPO, type ThemeId } from '@moekoder/shared';
import { Button, ThemePicker } from '@/components/ui';
import { useElectronAPI, useFfmpegStatus } from '@/hooks';
import { useAppStore, useOnboardingStore } from '@/stores';
import { applyTheme, persistTheme } from '@/lib/apply-theme';

/**
 * Section wrapper — identical visual treatment for every block on the
 * Settings page so the hierarchy reads as a flat list of panels rather than
 * nested UI. Kept inline in this file since no other screen consumes it.
 */
interface SectionProps {
  kanji: string;
  mono: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

const Section = ({ kanji, mono, title, description, children }: SectionProps) => (
  <section className="flex flex-col gap-4 rounded-xl border border-border bg-card/30 p-6">
    <header className="flex items-start gap-4">
      <span className="font-display text-4xl leading-none text-primary">{kanji}</span>
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">{mono}</span>
        <h2 className="font-display text-xl text-foreground">{title}</h2>
        {description && (
          <p className="max-w-[620px] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </header>
    <div>{children}</div>
  </section>
);

/**
 * Full-screen Settings view. Not a DOM-layered modal — the app-store flips
 * `activeView` to `'settings'` and this screen takes over the canvas, the
 * same pattern every other route uses. The titlebar stays mounted so the
 * user retains window controls.
 *
 * Sections:
 *   · Appearance   — ThemePicker, live-applies + persists
 *   · Onboarding   — replay the first-run wizard
 *   · FFmpeg       — status line + reinstall (triggers a fresh download)
 *   · Logs         — reveal <userData>/logs in the file manager
 *   · About        — jump to the About view
 *   · Meta         — app version + GitHub link
 */
export const Settings = () => {
  const api = useElectronAPI();
  const themeId = useAppStore(s => s.themeId);
  const setThemeId = useAppStore(s => s.setThemeId);
  const setView = useAppStore(s => s.setView);
  const resetOnboarding = useOnboardingStore(s => s.reset);

  const ffmpeg = useFfmpegStatus();

  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'logs' | 'ffmpeg' | 'github'>(null);

  useEffect(() => {
    let cancelled = false;
    api.app
      .getVersion()
      .then(v => {
        if (!cancelled) setAppVersion(v);
      })
      .catch(err => {
        console.warn('[settings] app.getVersion failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const onThemePick = useCallback(
    (id: ThemeId): void => {
      setThemeId(id);
      applyTheme(id);
      void persistTheme(id);
    },
    [setThemeId]
  );

  const onReplayOnboarding = useCallback(async (): Promise<void> => {
    try {
      await api.store.set('hasCompletedOnboarding', false);
    } catch (err) {
      console.warn('[settings] persist hasCompletedOnboarding=false failed', err);
    }
    resetOnboarding();
    setView('onboarding');
  }, [api, resetOnboarding, setView]);

  const onReinstallFfmpeg = useCallback(async (): Promise<void> => {
    setBusy('ffmpeg');
    try {
      await api.ffmpeg.removeInstalled();
      await api.store.set('hasCompletedOnboarding', false);
      resetOnboarding();
      setView('onboarding');
    } catch (err) {
      console.error('[settings] reinstall ffmpeg failed', err);
      // Refresh status so the UI reflects whatever state we ended in.
      await ffmpeg.refresh();
    } finally {
      setBusy(null);
    }
  }, [api, ffmpeg, resetOnboarding, setView]);

  const onOpenLogs = useCallback(async (): Promise<void> => {
    setBusy('logs');
    try {
      await api.app.openLogsFolder();
    } catch (err) {
      console.warn('[settings] open logs folder failed', err);
    } finally {
      setBusy(null);
    }
  }, [api]);

  const onOpenGithub = useCallback(async (): Promise<void> => {
    setBusy('github');
    try {
      await api.app.openExternal(`https://github.com/${GITHUB_REPO}`);
    } catch (err) {
      console.warn('[settings] openExternal github failed', err);
    } finally {
      setBusy(null);
    }
  }, [api]);

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient watermark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -bottom-24 select-none font-display leading-none text-primary/[0.05]"
        style={{ fontSize: '520px' }}
      >
        設
      </span>

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center gap-4 border-b border-border bg-popover/40 px-10 py-5 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => setView('single-idle')}>
          <ArrowLeft size={14} />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl leading-none text-primary">設</span>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              config · 設 · settei
            </span>
            <h1 className="font-display text-xl text-foreground">Settings</h1>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6">
          <Section
            kanji="色"
            mono="look · 色 · appearance"
            title="Appearance"
            description="Four themes, all borrowing their kanji from Japanese color names. Changes apply immediately."
          >
            <ThemePicker value={themeId} onChange={onThemePick} />
          </Section>

          <Section
            kanji="初"
            mono="first run · 初 · shō"
            title="Replay onboarding"
            description="Walk through the first-run wizard again to re-pick defaults. Your current settings are preserved until you finish the wizard."
          >
            <Button variant="ghost" size="sm" onClick={onReplayOnboarding}>
              <RotateCcw size={14} />
              Replay onboarding
            </Button>
          </Section>

          <Section
            kanji="引"
            mono="ffmpeg · 引擎 · engine"
            title="FFmpeg engine"
            description="MoeKoder bundles ffmpeg + ffprobe under your user data directory. Reinstall if the binaries look damaged or you want a fresh copy."
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3 font-mono text-[11px]">
                <span
                  className={`h-2 w-2 rounded-full ${ffmpeg.installed ? 'bg-good' : 'bg-bad'}`}
                  aria-hidden="true"
                />
                <span className="uppercase tracking-[0.18em] text-muted">
                  {ffmpeg.loading ? 'checking…' : ffmpeg.installed ? 'installed' : 'not installed'}
                </span>
                <span className="text-muted">·</span>
                <span className="text-foreground">
                  {ffmpeg.version ?? (ffmpeg.loading ? '…' : 'no binary found')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReinstallFfmpeg}
                  disabled={busy === 'ffmpeg'}
                >
                  <RefreshCw size={14} />
                  {busy === 'ffmpeg' ? 'Reinstalling…' : 'Reinstall ffmpeg'}
                </Button>
              </div>
            </div>
          </Section>

          <Section
            kanji="録"
            mono="logs · 録 · roku"
            title="Logs"
            description="Open the log folder in your file manager. Useful when filing an issue — zip the folder and attach it."
          >
            <Button variant="ghost" size="sm" onClick={onOpenLogs} disabled={busy === 'logs'}>
              <FolderOpen size={14} />
              Open logs folder
            </Button>
          </Section>

          <Section
            kanji="解"
            mono="about · 解 · kai"
            title="About MoeKoder"
            description="Version, build, credits, and links to the rest of the Shiro Suite."
          >
            <Button variant="ghost" size="sm" onClick={() => setView('about')}>
              <Info size={14} />
              About MoeKoder
            </Button>
          </Section>

          <Section kanji="版" mono="version · 版 · han" title="Version & source">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                <span className="uppercase tracking-[0.18em] text-muted">app</span>
                <span className="text-foreground">
                  <b>{APP_NAME}</b> v{appVersion ?? '…'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenGithub}
                  disabled={busy === 'github'}
                >
                  <ExternalLink size={14} />
                  View repository on GitHub
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
};
