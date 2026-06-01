import { useTranslation } from 'react-i18next';
import { IconPlus } from '@/components/ui/icons';

interface QueueEmptyProps {
  onAddPair: () => void;
}

/**
 * Empty-state card. Shown when the queue has zero items so the user has
 * an obvious next action without scanning the whole screen.
 */
export const QueueEmpty = ({ onAddPair }: QueueEmptyProps) => {
  const { t } = useTranslation('queue');
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-card/30 px-10 py-20 text-center">
      <span aria-hidden className="font-display text-6xl text-foreground/40">
        列
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-2xl text-foreground">{t('empty.heading')}</h3>
        <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
          {t('empty.body')}
        </p>
      </div>
      <button
        type="button"
        onClick={onAddPair}
        className="flex items-center gap-2 rounded-md border border-primary bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary transition hover:bg-[color-mix(in_oklab,var(--primary)_24%,transparent)]"
      >
        <IconPlus size={14} />
        <span>{t('empty.cta')}</span>
      </button>
    </div>
  );
};
