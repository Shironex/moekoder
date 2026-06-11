import { SUPPORTED_LANGUAGES } from '@moekoder/shared';
import { useUiLanguage } from '@/hooks/useUiLanguage';
import { cn } from '@/lib/cn';

interface LanguagePickerProps {
  /** Optional accessible label for the button group (e.g. localized "Language"). */
  ariaLabel?: string;
  /** Optional extra classes for the group wrapper. */
  className?: string;
}

/**
 * Compact UI-language switcher. Renders one button per shipped language; the
 * label is the endonym (`English`, `Polski`) shown verbatim regardless of the
 * active language, so a user who landed on the wrong language can always find
 * their own. Picking persists immediately (i18next + localStorage mirror +
 * electron-store) via {@link useUiLanguage}.
 *
 * Reused by the Settings appearance section and the onboarding Welcome step.
 * Styling mirrors {@link ThemePicker}'s `aria-pressed` selection vocabulary.
 */
export const LanguagePicker = ({ ariaLabel, className }: LanguagePickerProps) => {
  const { language, setLanguage } = useUiLanguage();
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex items-center gap-1.5', className)}>
      {SUPPORTED_LANGUAGES.map(lang => {
        const selected = language === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            aria-pressed={selected}
            onClick={() => setLanguage(lang.code)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              selected
                ? 'border-primary/50 bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
            )}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
};
