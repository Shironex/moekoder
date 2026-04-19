import { IconCheck } from '@/components/ui';
import { cn } from '@/lib/cn';
import { OB_PRESETS, type ObPresetId } from '../data';

interface PresetStepProps {
  value: ObPresetId;
  onChange: (id: ObPresetId) => void;
}

/**
 * Step 05 · Preset. Three-card picker — Fast / Balanced / Pristine. Parent
 * ships `value = 'balanced'` as the default so the Continue CTA enables
 * immediately without forcing a pick.
 */
export const Preset = ({ value, onChange }: PresetStepProps) => {
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">設</span>
        <span>step 05 · default preset</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>均</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          How <em className="not-italic text-primary">fussy</em> are you?
        </h1>
        <p className="max-w-[720px] text-sm leading-relaxed text-muted-foreground">
          This is just the default — you can change it per-encode.{' '}
          <b className="text-foreground">Balanced</b> is the right answer for ~95% of episodes. The
          others are there for when you&apos;re not in the mood to think.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {OB_PRESETS.map(p => {
          const selected = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              aria-pressed={selected}
              className={cn(
                'relative flex flex-col items-start gap-3 rounded-xl border bg-card/30 p-5 text-left transition',
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

              <span className="font-display text-5xl leading-none text-primary">{p.k}</span>
              <b className="font-display text-2xl text-foreground">{p.name}</b>
              <span className="text-sm leading-relaxed text-muted-foreground">{p.hint}</span>

              <div className="mt-1 flex w-full flex-wrap gap-2">
                {p.specs.map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-popover/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
                  >
                    <span>{k}</span>
                    <b className="font-sans text-[11px] normal-case tracking-normal text-foreground">
                      {v}
                    </b>
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
