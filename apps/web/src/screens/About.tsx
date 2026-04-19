import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { APP_KANJI, APP_NAME, APP_SIGIL, GITHUB_REPO } from '@moekoder/shared';
import { Button } from '@/components/ui';
import { useElectronAPI } from '@/hooks';
import { useAppStore } from '@/stores';
import { cn } from '@/lib/cn';

/**
 * Shiro Suite sibling apps. The Moekoder card is marked `youAreHere` so it
 * renders the "you are here" inline label instead of a link. The other three
 * open in the user's browser via `app.openExternal`.
 */
interface SiblingCard {
  id: 'shiranami' | 'shiroani' | 'moekoder' | 'kireimanga';
  name: string;
  /** Full kanji / kanji+katakana brand form per the Shiro Suite convention. */
  kanji: string;
  /** Single-kanji sigil. */
  sigil: string;
  blurb: string;
  /** Absolute URL; `null` for the "you are here" sibling. */
  url: string | null;
  youAreHere?: boolean;
}

const SIBLINGS: readonly SiblingCard[] = [
  {
    id: 'shiranami',
    name: 'Shiranami',
    kanji: '白波',
    sigil: '波',
    blurb: 'Anime tracking & discovery. Where your list lives.',
    url: 'https://shiranami.moe',
  },
  {
    id: 'shiroani',
    name: 'ShiroAni',
    kanji: '白アニ',
    sigil: 'ア',
    blurb: 'A quieter way to watch. Stream without the noise.',
    url: 'https://shiroani.moe',
  },
  {
    id: 'moekoder',
    name: APP_NAME,
    kanji: APP_KANJI,
    sigil: APP_SIGIL,
    blurb: 'Burn subtitles into video, cutely. You are here.',
    url: null,
    youAreHere: true,
  },
  {
    id: 'kireimanga',
    name: 'KireiManga',
    kanji: '綺麗漫画',
    sigil: '漫',
    blurb: 'Manga reader with taste. Clean pages, nothing else.',
    url: 'https://kireimanga.moe',
  },
] as const;

/**
 * About view. Logo + wordmark, short blurb, Shiro Suite sibling cards,
 * version + build hash, and credits. Back button returns to Settings so the
 * Settings → About → Settings loop is a single click away.
 *
 * The build hash is replaced at bundle time by Vite's `define` option
 * (see `vite.config.ts` → `__MOEKODER_BUILD_HASH__`). When the build host
 * can't resolve a git hash it falls back to `'dev'` so the line never
 * renders empty.
 */
export const About = () => {
  const api = useElectronAPI();
  const setView = useAppStore(s => s.setView);

  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.app
      .getVersion()
      .then(v => {
        if (!cancelled) setVersion(v);
      })
      .catch(err => console.warn('[about] app.getVersion failed', err));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const buildHash = __MOEKODER_BUILD_HASH__;

  const onOpen = useCallback(
    async (url: string): Promise<void> => {
      try {
        await api.app.openExternal(url);
      } catch (err) {
        console.warn('[about] openExternal failed', url, err);
      }
    },
    [api]
  );

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient watermark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -bottom-28 select-none font-display leading-none text-primary/[0.05]"
        style={{ fontSize: '520px' }}
      >
        {APP_SIGIL}
      </span>

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center gap-4 border-b border-border bg-popover/40 px-10 py-5 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={() => setView('settings')}>
          <ArrowLeft size={14} />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl leading-none text-primary">解</span>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              about · 解 · kai
            </span>
            <h1 className="font-display text-xl text-foreground">About</h1>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8">
          {/* Hero */}
          <section className="flex flex-col gap-6 rounded-xl border border-border bg-card/30 p-8">
            <div className="flex items-start gap-6">
              <span
                className="font-display text-[120px] leading-none text-primary"
                style={{
                  textShadow: '0 0 40px color-mix(in oklab, var(--primary) 30%, transparent)',
                }}
              >
                {APP_SIGIL}
              </span>
              <div className="flex flex-col gap-3 pt-3">
                <h2 className="font-display text-5xl leading-none text-foreground">
                  {APP_NAME.slice(0, 3)}
                  <em className="not-italic text-primary">{APP_NAME.slice(3)}</em>
                </h2>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  <span className="font-display text-sm text-primary">焼</span>
                  <span>subtitle burner</span>
                  <span className="h-1 w-1 rounded-full bg-muted/50" />
                  <span>yoru edition</span>
                </div>
                <p className="max-w-[560px] text-base leading-relaxed text-muted-foreground">
                  Burn subtitles into video, cutely. Built for anime power users — one MKV, one ASS,
                  one MP4 out the other side. No cloud, no telemetry, no ads.
                </p>
              </div>
            </div>
          </section>

          {/* Shiro Suite */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl text-primary">白</span>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  shiro suite · 白 · family
                </span>
                <h2 className="font-display text-xl text-foreground">The Shiro Suite</h2>
              </div>
              <div className="ml-4 h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {SIBLINGS.map(s => {
                const clickable = !s.youAreHere && !!s.url;
                const content = (
                  <>
                    <span className="font-display text-[56px] leading-none text-primary">
                      {s.sigil}
                    </span>
                    <div className="flex flex-1 flex-col gap-1 leading-tight">
                      <div className="flex items-center gap-2">
                        <b className="font-display text-lg text-foreground">{s.name}</b>
                        <span className="font-display text-sm text-primary/80">{s.kanji}</span>
                        {s.youAreHere && (
                          <span className="ml-auto rounded-sm border border-primary/40 bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
                            · you are here
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] leading-relaxed text-muted-foreground">
                        {s.blurb}
                      </span>
                    </div>
                    {clickable && (
                      <ExternalLink
                        size={14}
                        className="shrink-0 text-muted transition group-hover:text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </>
                );

                if (clickable) {
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void onOpen(s.url as string)}
                      className={cn(
                        'group flex items-center gap-4 rounded-xl border border-border bg-card/30 p-4 text-left transition',
                        'hover:border-primary/60 hover:bg-card/50'
                      )}
                    >
                      {content}
                    </button>
                  );
                }
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-4 rounded-xl border p-4',
                      'border-primary/50 bg-[color-mix(in_oklab,var(--primary)_6%,var(--card))]'
                    )}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Version + meta */}
          <section className="grid gap-4 rounded-xl border border-border bg-card/30 p-6 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
                version
              </span>
              <span className="font-display text-base text-foreground">
                {APP_NAME} <span className="text-primary">v{version ?? '…'}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
                build
              </span>
              <span className="font-mono text-[13px] text-foreground">{buildHash}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
                license
              </span>
              <button
                type="button"
                onClick={() => void onOpen(`https://github.com/${GITHUB_REPO}/blob/main/LICENSE`)}
                className="group flex items-center gap-1.5 self-start font-mono text-[13px] text-foreground transition hover:text-primary"
              >
                <span>MIT</span>
                <ExternalLink size={11} className="text-muted group-hover:text-primary" />
              </button>
            </div>
          </section>

          {/* Credits + source */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/30 p-6">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl text-primary">謝</span>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  credits · 謝 · sha
                </span>
                <h2 className="font-display text-lg text-foreground">Built by Shironex</h2>
              </div>
            </div>
            <p className="max-w-[620px] text-sm leading-relaxed text-muted-foreground">
              A one-person project, stitched together with ffmpeg, libass, Electron, and a lot of
              late-night tea. Issues, PRs, and kind words all welcome on GitHub.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onOpen(`https://github.com/${GITHUB_REPO}`)}
              >
                <ExternalLink size={14} />
                GitHub · {GITHUB_REPO}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};
