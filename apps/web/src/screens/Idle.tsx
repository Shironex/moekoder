import { Trans, useTranslation } from 'react-i18next';
import { DropOverlay, PageHead } from '@/components/ui';
import type { PickedFile } from '@/components/chrome';
import { cn } from '@/lib/cn';
import mascotUrl from '@/assets/mascot.png';

interface IdleProps {
  video: PickedFile | null;
  subs: PickedFile | null;
  out: { name: string; path: string } | null;
  /** Optional ffmpeg build string for the top-right meta slot. */
  ffmpegVersion?: string | null;
  /**
   * Drop handler — receives auto-categorised path lists for files and
   * folders. The Idle screen wraps its content in `<DropOverlay>` so the
   * affordance covers the whole screen, not just the inner card.
   */
  onDropFiles?: (payload: { paths: string[]; folderPaths: string[] }) => void;
}

interface StepPillProps {
  n: string;
  label: string;
  done: boolean;
}

const StepPill = ({ n, label, done }: StepPillProps) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        'flex h-2 w-2 rounded-full border transition',
        done
          ? 'border-primary bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_55%,transparent)]'
          : 'border-border bg-transparent'
      )}
    />
    <span
      className={cn(
        'font-mono text-[10px] uppercase tracking-[0.22em]',
        done ? 'text-foreground' : 'text-muted'
      )}
    >
      {n} · {label}
    </span>
  </div>
);

/**
 * Idle screen. The user sees this before kicking an encode off — it prompts
 * them to pick three ingredients in the sidebar, shows a live step-indicator
 * that mirrors sidebar progress, and displays a large ambient kanji
 * watermark behind the call to action.
 *
 * Pure Tailwind composition. The `PageHead` + `Button` primitives are
 * reused from `@/components/ui`.
 */
export const IdleScreen = ({ video, subs, out, ffmpegVersion, onDropFiles }: IdleProps) => {
  const { t } = useTranslation('idle');
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const content = (
    <section className="relative flex flex-1 flex-col gap-8 overflow-hidden px-10 py-8">
      <PageHead
        screen="idle"
        route="single"
        title={t('title')}
        subtitle={t('subtitle')}
        right={
          <div className="flex flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            <span>— · {today}</span>
            <span className="text-foreground">
              <b>{ffmpegVersion ?? 'ffmpeg n8.1'}</b> · NVENC
            </span>
            <span>{t('meta.session')} 0001</span>
          </div>
        }
      />

      <div className="relative z-[1] flex flex-1 flex-col items-start justify-center gap-6 rounded-lg border border-dashed border-border/80 bg-card/30 p-10">
        {/* Centered ambient overlay — mascot flanked by two soft hairlines.
            Sits behind the left-aligned content with a dimmed opacity so she
            reads as a waiting companion, not foreground chrome. Only visible
            on wider cards so narrow layouts don't feel cluttered. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex"
        >
          <div className="flex items-center gap-5">
            <span className="h-px w-20 bg-gradient-to-r from-transparent to-primary/30" />
            <img
              src={mascotUrl}
              alt=""
              width={200}
              height={200}
              className="h-[200px] w-[200px] select-none object-contain opacity-45 drop-shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_25%,transparent)]"
            />
            <span className="h-px w-20 bg-gradient-to-l from-transparent to-primary/30" />
          </div>
        </div>

        <div className="relative z-[1] flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            idle · 待
          </span>
          <h2 className="max-w-[40ch] font-display text-5xl leading-[1.05] text-foreground">
            <Trans
              t={t}
              i18nKey="heading"
              components={{ em: <em className="not-italic text-primary" /> }}
            />
          </h2>
          <p className="max-w-[56ch] text-base leading-relaxed text-muted-foreground">
            {t('body')}
          </p>
        </div>

        <div className="relative z-[1] flex items-center gap-4">
          <StepPill n="01" label={t('step.video')} done={!!video} />
          <span className="h-px w-8 bg-border" />
          <StepPill n="02" label={t('step.subs')} done={!!subs} />
          <span className="h-px w-8 bg-border" />
          <StepPill n="03" label={t('step.output')} done={!!out} />
        </div>

        {video && subs && out && (
          <div className="relative z-[1] flex items-center gap-2 rounded-sm border border-primary/30 bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] px-3 py-2">
            <span className="font-display text-lg text-primary">好</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
              {t('ready')}
            </span>
          </div>
        )}
      </div>
    </section>
  );

  // Wrap in the drop overlay only when a handler is supplied — keeps the
  // screen renderable in isolation (e.g. future Storybook / visual tests).
  if (!onDropFiles) return content;
  return <DropOverlay onFiles={onDropFiles}>{content}</DropOverlay>;
};
