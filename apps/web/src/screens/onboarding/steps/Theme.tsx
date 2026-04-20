import { type ThemeId } from '@moekoder/shared';
import { ThemePicker } from '@/components/ui';

interface ThemeStepProps {
  /** Selected theme id. */
  value: ThemeId;
  /** Fires when the user picks a new theme — parent persists + applies. */
  onChange: (id: ThemeId) => void;
}

/**
 * Step 04 · Theme. Shows all six shipped themes as preview cards. Selecting
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
          Six themes, all borrowing their kanji from Japanese color names.{' '}
          <b className="text-foreground">Plum</b> is the default — warm, purple, cozy. Changes apply
          immediately so you can feel them against the wizard.
        </p>
      </div>

      <ThemePicker value={value} onChange={onChange} />

      <div className="flex items-center gap-3 rounded-lg border border-border bg-card/25 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-base text-primary">設</span>
        <span>changeable later · settings · theme</span>
      </div>
    </div>
  );
};
