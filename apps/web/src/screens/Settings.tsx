import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, FolderOpen, Info, RefreshCw, RotateCcw } from 'lucide-react';
import { APP_NAME, GITHUB_REPO, UPDATER_EVENT_CHANNELS, type ThemeId } from '@moekoder/shared';
import { Button, ThemePicker } from '@/components/ui';
import { useElectronAPI, useFfmpegStatus, useSetting } from '@/hooks';
import { useAppStore, useOnboardingStore } from '@/stores';
import { applyTheme, persistTheme } from '@/lib/apply-theme';
import { logger } from '@/lib/logger';
import { CustomPresetsSection } from './Settings/CustomPresetsSection';
import { EncodingSection } from './Settings/EncodingSection';
import { QueueSettingsSection } from './Settings/QueueSettingsSection';

const log = logger('settings');

/**
 * Compact updater state machine that mirrors a subset of the bottom-right
 * `Updater` panel's phases so the Settings "Updates" section can show a
 * status chip alongside its toggle + check button. Intentionally duplicated
 * rather than hoisted to a shared store — it's a handful of lines and keeps
 * Settings self-contained.
 */
type UpdaterChipState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string | null }
  | { kind: 'downloaded'; version: string | null }
  | { kind: 'error' };

const updaterChipLabel = (s: UpdaterChipState): string => {
  switch (s.kind) {
    case 'idle':
      return 'no checks yet this session';
    case 'checking':
      return 'checking…';
    case 'up-to-date':
      return `you're on the latest version`;
    case 'available':
      return s.version ? `update available · v${s.version}` : 'update available';
    case 'downloaded':
      return s.version ? `ready to install · v${s.version}` : 'ready to install';
    case 'error':
      return 'last check failed';
  }
};

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
  const [busy, setBusy] = useState<null | 'logs' | 'ffmpeg' | 'github' | 'update-check'>(null);
  const [autoCheck, setAutoCheck] = useSetting('autoCheckUpdates');
  const [useEmbeddedFonts, setUseEmbeddedFonts] = useSetting('useEmbeddedFonts');
  const [updaterChip, setUpdaterChip] = useState<UpdaterChipState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    api.app
      .getVersion()
      .then(v => {
        if (!cancelled) setAppVersion(v);
      })
      .catch(err => {
        log.warn('app.getVersion failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.CHECKING, () => setUpdaterChip({ kind: 'checking' }))
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.NOT_AVAILABLE, () =>
        setUpdaterChip({ kind: 'up-to-date' })
      )
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.AVAILABLE, payload => {
        const v =
          payload && typeof payload === 'object' ? (payload as { version?: string }).version : null;
        setUpdaterChip({ kind: 'available', version: v ?? null });
      })
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.DOWNLOADED, payload => {
        const v =
          payload && typeof payload === 'object' ? (payload as { version?: string }).version : null;
        setUpdaterChip({ kind: 'downloaded', version: v ?? null });
      })
    );
    unsubs.push(
      api.updater.on(UPDATER_EVENT_CHANNELS.ERROR, () => setUpdaterChip({ kind: 'error' }))
    );
    return () => {
      for (const u of unsubs) {
        try {
          u();
        } catch (err) {
          log.warn('updater unsubscribe failed', err);
        }
      }
    };
  }, [api]);

  const onToggleAutoCheck = useCallback(
    async (next: boolean): Promise<void> => {
      try {
        await setAutoCheck(next);
      } catch (err) {
        log.warn('persist autoCheckUpdates failed', err);
      }
    },
    [setAutoCheck]
  );

  const onToggleUseEmbeddedFonts = useCallback(
    async (next: boolean): Promise<void> => {
      try {
        await setUseEmbeddedFonts(next);
      } catch (err) {
        log.warn('persist useEmbeddedFonts failed', err);
      }
    },
    [setUseEmbeddedFonts]
  );

  const onCheckForUpdates = useCallback(async (): Promise<void> => {
    setBusy('update-check');
    try {
      await api.updater.check();
    } catch (err) {
      log.warn('updater.check failed', err);
    } finally {
      setBusy(null);
    }
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
      log.warn('persist hasCompletedOnboarding=false failed', err);
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
      log.error('reinstall ffmpeg failed', err);
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
      log.warn('open logs folder failed', err);
    } finally {
      setBusy(null);
    }
  }, [api]);

  const onOpenGithub = useCallback(async (): Promise<void> => {
    setBusy('github');
    try {
      await api.app.openExternal(`https://github.com/${GITHUB_REPO}`);
    } catch (err) {
      log.warn('openExternal github failed', err);
    } finally {
      setBusy(null);
    }
  }, [api]);

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient watermark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -bottom-24 select-none font-display text-[520px] leading-none text-primary/[0.05]"
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
            description="Six themes, all borrowing their kanji from Japanese color names. Changes apply immediately."
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
            kanji="符"
            mono="encoding · 符 · fugō"
            title="Encoding"
            description="Codec, hardware encoder, and quality knobs for every encode the app starts. Quick-set Fast/Balanced/Pristine for sane defaults; tune CQ + presets for fine control."
          >
            <EncodingSection />
          </Section>

          <Section
            kanji="集"
            mono="presets · 集 · shū"
            title="Custom presets"
            description="Save the current encoding profile under a name and apply it later in one click. Up to 20 presets; names must be unique. Survives app restart."
          >
            <CustomPresetsSection />
          </Section>

          <Section
            kanji="字"
            mono="fonts · 字 · ji"
            title="Embedded fonts"
            description="When the source is an MKV with attached fonts (the fansub default), MoeKoder extracts them into a per-job temp dir and feeds the path to libass so \\fn(CustomFont) typesetting renders as the author intended. Off ⇒ libass falls back to system fonts only, matching v0.4 behaviour."
          >
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={useEmbeddedFonts ?? true}
                onChange={e => void onToggleUseEmbeddedFonts(e.target.checked)}
              />
              <span className="flex flex-col leading-tight">
                <b className="font-display text-sm text-foreground">
                  Use embedded fonts (recommended)
                </b>
                <span className="text-[12px] text-muted-foreground">
                  On by default. Cleans up after every encode — no fonts are left on disk. Toggle
                  off if you'd rather every typeset cue render in Arial.
                </span>
              </span>
            </label>
          </Section>

          <Section
            kanji="列"
            mono="queue · 列 · retsu"
            title="Queue"
            description="Knobs for the batch pipeline. Concurrency mirrors the segmented control on the Queue screen — both write to electron-store, so changes from either side stick."
          >
            <QueueSettingsSection />
          </Section>

          <Section
            kanji="新"
            mono="updates · 新 · shin"
            title="Updates"
            description="MoeKoder never phones home unless you click Check — that's the pledge. Opt in below if you'd rather the app check in the background (once 5 s after launch, then hourly)."
          >
            <div className="flex flex-col gap-4">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={autoCheck ?? false}
                  onChange={e => void onToggleAutoCheck(e.target.checked)}
                />
                <span className="flex flex-col leading-tight">
                  <b className="font-display text-sm text-foreground">
                    Check for updates automatically
                  </b>
                  <span className="text-[12px] text-muted-foreground">
                    Off by default. When on, MoeKoder queries GitHub Releases on launch + once per
                    hour. Updates are never installed without your click.
                  </span>
                </span>
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3 font-mono text-[11px]">
                <span
                  className={`h-2 w-2 rounded-full ${
                    updaterChip.kind === 'available' || updaterChip.kind === 'downloaded'
                      ? 'bg-primary'
                      : updaterChip.kind === 'error'
                        ? 'bg-bad'
                        : updaterChip.kind === 'up-to-date'
                          ? 'bg-good'
                          : 'bg-muted'
                  }`}
                  aria-hidden="true"
                />
                <span className="uppercase tracking-[0.18em] text-muted">status</span>
                <span className="text-muted">·</span>
                <span className="text-foreground">{updaterChipLabel(updaterChip)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCheckForUpdates}
                  disabled={busy === 'update-check'}
                >
                  <RefreshCw size={14} />
                  {busy === 'update-check' ? 'Checking…' : 'Check for updates now'}
                </Button>
              </div>
            </div>
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
