import { THEMES, type ThemeId } from '@moekoder/shared';
import { IconCheck } from '@/components/ui';
import { cn } from '@/lib/cn';

interface ThemeStepProps {
  /** Selected theme id. */
  value: ThemeId;
  /** Fires when the user picks a new theme — parent persists + applies. */
  onChange: (id: ThemeId) => void;
}

/**
 * Short mood label per theme. Kept local so the shared package doesn't grow
 * a UI-flavoured string it never uses elsewhere.
 */
const MOOD: Record<ThemeId, string> = {
  midnight: 'blue · yoru — deep, calm, late',
  plum: 'plum · murasaki — warm, purple, cozy',
  matcha: 'green · midori — quiet, grounded',
  paper: 'light · kami — bright, spare, honest',
};

/**
 * Step 04 · Theme. Shows all four shipped themes as preview cards. Selecting
 * a card flips the live app theme immediately (parent handles both `applyTheme`
 * and the onboarding-store mirror) so the user sees the change against the
 * onboarding chrome before committing.
 */
export const Theme = ({ value, onChange }: ThemeStepProps) => {
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">色</span>
        <span>step 04 · theme</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>look · 色</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          Pick a <em className="not-italic text-primary">mood.</em>
        </h1>
        <p className="max-w-[720px] text-sm leading-relaxed text-muted-foreground">
          Four themes, all borrowing their kanji from Japanese color names.{' '}
          <b className="text-foreground">Midnight</b> is the default — deep, calm, late. Changes
          apply immediately so you can feel them against the wizard.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {THEMES.map(t => {
          const selected = value === t.id;
          const tokens = t.tokens;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-pressed={selected}
              className={cn(
                'relative flex flex-col items-start gap-3 overflow-hidden rounded-xl border p-5 text-left transition',
                selected
                  ? 'border-primary shadow-[0_0_36px_-12px_color-mix(in_oklab,var(--primary)_55%,transparent)]'
                  : 'border-border hover:border-primary/60'
              )}
              style={{
                background: tokens.background,
                color: tokens.foreground,
              }}
            >
              {selected && (
                <span
                  className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    background: tokens.primary,
                    color: tokens.primaryForeground,
                  }}
                >
                  <IconCheck size={12} strokeWidth={2.6} />
                </span>
              )}
              {t.mode === 'light' && (
                <span
                  className="absolute left-4 top-4 h-2 w-2 rounded-full"
                  style={{ background: tokens.primary }}
                  title="light theme"
                  aria-hidden="true"
                />
              )}

              <span
                className="font-display text-[72px] leading-none"
                style={{ color: tokens.primary }}
              >
                {t.kanji}
              </span>
              <div className="flex flex-col gap-1 leading-none">
                <b className="font-display text-xl" style={{ color: tokens.foreground }}>
                  {t.name}
                </b>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.22em]"
                  style={{ color: tokens.mutedForeground }}
                >
                  {t.romaji} · {t.mode}
                </span>
              </div>
              <span
                className="text-[12px] leading-relaxed"
                style={{ color: tokens.mutedForeground }}
              >
                {MOOD[t.id]}
              </span>

              {/* Mini swatch strip */}
              <div className="mt-1 flex w-full gap-1.5">
                <span
                  className="h-1.5 flex-1 rounded-full"
                  style={{ background: tokens.primary }}
                />
                <span className="h-1.5 flex-1 rounded-full" style={{ background: tokens.card }} />
                <span className="h-1.5 flex-1 rounded-full" style={{ background: tokens.border }} />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-card/25 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-base text-primary">設</span>
        <span>changeable later · settings · theme</span>
      </div>
    </div>
  );
};
