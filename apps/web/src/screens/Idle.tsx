import { PageHead } from '@/components/ui';
import type { PickedFile } from '@/components/chrome';
import { cn } from '@/lib/cn';

interface IdleProps {
  video: PickedFile | null;
  subs: PickedFile | null;
  out: { name: string; path: string } | null;
  /** Optional ffmpeg build string for the top-right meta slot. */
  ffmpegVersion?: string | null;
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
export const IdleScreen = ({ video, subs, out, ffmpegVersion }: IdleProps) => {
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <section className="relative flex flex-1 flex-col gap-8 overflow-hidden px-10 py-8">
      <PageHead
        screen="idle"
        route="single"
        title="Burn subs."
        subtitle="Drop an MKV and an ASS file — MoeKoder hardburns them with the GPU while the pot whistles. No preview noise. No pop-ups."
        right={
          <div className="flex flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            <span>— · {today}</span>
            <span className="text-foreground">
              <b>{ffmpegVersion ?? 'ffmpeg 7.0.1'}</b> · NVENC
            </span>
            <span>session 0001</span>
          </div>
        }
      />

      {/* Centered composition — kanji + flanking hairlines + heading + copy
          + step dots stack vertically in the middle of the available space,
          per the design prototype. Previous versions put the kanji in the
          top/bottom-right corners of a bordered card, which drifted from the
          spec. */}
      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {/* Kanji overlay with flanking hairlines. */}
        <div className="flex items-center gap-6">
          <span
            className="h-px w-28 bg-gradient-to-r from-transparent to-primary/40"
            aria-hidden="true"
          />
          <span
            aria-hidden="true"
            className="select-none font-display text-[240px] leading-none text-primary/60"
            style={{ textShadow: '0 0 60px color-mix(in oklab, var(--primary) 40%, transparent)' }}
          >
            始
          </span>
          <span
            className="h-px w-28 bg-gradient-to-l from-transparent to-primary/40"
            aria-hidden="true"
          />
        </div>

        <h2 className="max-w-[44ch] font-display text-5xl leading-[1.05] text-foreground">
          Ready when <em className="not-italic text-primary">you</em> are.
        </h2>
        <p className="max-w-[60ch] text-base leading-relaxed text-muted-foreground">
          Pick a video, a subtitle file, and a save location in the left rail — MoeKoder will line
          them up and wait for your go-ahead.
        </p>

        <div className="flex items-center gap-4 pt-2">
          <StepPill n="01" label="video" done={!!video} />
          <span className="h-px w-8 bg-border" />
          <StepPill n="02" label="subs" done={!!subs} />
          <span className="h-px w-8 bg-border" />
          <StepPill n="03" label="output" done={!!out} />
        </div>

        {video && subs && out && (
          <div className="mt-2 flex items-center gap-2 rounded-sm border border-primary/30 bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] px-3 py-2">
            <span className="font-display text-lg text-primary">好</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
              all three · ready · press begin in the rail
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
