import { THEMES, type ThemeId } from '@moekoder/shared';
import { IconCheck } from './icons';
import { cn } from '@/lib/cn';

interface ThemePickerProps {
  /** Currently selected theme id. */
  value: ThemeId;
  /** Fires when the user picks a new theme. Parent is responsible for persisting and applying. */
  onChange: (id: ThemeId) => void;
  /** Optional extra classes for the grid wrapper. */
  className?: string;
}

/**
 * Short mood label per theme. Kept adjacent to the picker so the shared
 * package doesn't grow a UI-only string it never uses elsewhere. Reused by
 * both the Onboarding Theme step and the Settings appearance section.
 */
const MOOD: Record<ThemeId, string> = {
  midnight: 'blue · yoru — deep, calm, late',
  plum: 'plum · murasaki — warm, purple, cozy',
  matcha: 'green · midori — quiet, grounded',
  paper: 'light · kami — bright, spare, honest',
};

/**
 * Reusable theme picker. Renders all four shipped themes as preview cards;
 * clicking a card fires `onChange` with the new id. The card's inline styles
 * are driven by each theme's tokens so the preview shows the final look
 * against the current chrome before the caller persists + applies.
 */
export const ThemePicker = ({ value, onChange, className }: ThemePickerProps) => (
  <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
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

          <span className="font-display text-[72px] leading-none" style={{ color: tokens.primary }}>
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
          <span className="text-[12px] leading-relaxed" style={{ color: tokens.mutedForeground }}>
            {MOOD[t.id]}
          </span>

          {/* Mini swatch strip */}
          <div className="mt-1 flex w-full gap-1.5">
            <span className="h-1.5 flex-1 rounded-full" style={{ background: tokens.primary }} />
            <span className="h-1.5 flex-1 rounded-full" style={{ background: tokens.card }} />
            <span className="h-1.5 flex-1 rounded-full" style={{ background: tokens.border }} />
          </div>
        </button>
      );
    })}
  </div>
);
