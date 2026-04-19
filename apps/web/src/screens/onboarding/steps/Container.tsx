import { IconCheck } from '@/components/ui';
import { cn } from '@/lib/cn';
import { OB_CONTS, type ObContainerExt } from '../data';

interface ContainerStepProps {
  value: ObContainerExt;
  onChange: (ext: ObContainerExt) => void;
}

/**
 * Step 07 · Container. Three-card picker for the output container format.
 * Default is MP4 so Continue enables immediately.
 */
export const Container = ({ value, onChange }: ContainerStepProps) => {
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">器</span>
        <span>step 07 · container</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>format</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          Which <em className="not-italic text-primary">container?</em>
        </h1>
        <p className="max-w-[720px] text-sm leading-relaxed text-muted-foreground">
          The outer format — what the file ends in. <b className="text-foreground">MP4</b> plays on
          every device ever made. <b className="text-foreground">MKV</b> is better if you want to
          keep your audio choices. <b className="text-foreground">WebM</b> is smaller but slower.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {OB_CONTS.map(c => {
          const selected = value === c.ext;
          return (
            <button
              key={c.ext}
              type="button"
              onClick={() => onChange(c.ext)}
              aria-pressed={selected}
              className={cn(
                'relative flex flex-col items-start gap-3 rounded-xl border bg-card/30 p-6 text-left transition',
                selected
                  ? 'border-primary bg-primary/10 shadow-[0_0_32px_-12px_color-mix(in_oklab,var(--primary)_55%,transparent)]'
                  : 'border-border hover:border-primary/60 hover:bg-card/50'
              )}
            >
              {selected && (
                <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <IconCheck size={12} strokeWidth={2.6} />
                </span>
              )}
              <div className="flex items-baseline gap-1">
                <span className="font-display text-4xl leading-none text-muted">.</span>
                <em className="font-display text-6xl not-italic leading-none text-primary">
                  {c.ext}
                </em>
              </div>
              <b className="font-display text-xl text-foreground">{c.name} container</b>
              <p className="text-sm leading-relaxed text-muted-foreground">{c.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
