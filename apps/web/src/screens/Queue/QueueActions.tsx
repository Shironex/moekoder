import { useTranslation } from 'react-i18next';
import type { QueueStats } from '@moekoder/shared';
import { IconPause, IconPlay, IconPlus, IconTrash } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

interface QueueActionsProps {
  stats: QueueStats;
  running: boolean;
  paused: boolean;
  /** True when a Single-route encode is active. Disables Start so the user
   *  can't kick the queue off until the Single encode is stopped. */
  singleEncodeActive?: boolean;
  concurrency: 1 | 2 | 3 | 4;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onClearDone: () => void;
  onAddPair: () => void;
  onConcurrencyChange: (concurrency: 1 | 2 | 3 | 4) => void;
}

const CONCURRENCY_OPTIONS: ReadonlyArray<1 | 2 | 3 | 4> = [1, 2, 3, 4];

/**
 * Action bar above the queue list. Owns the Start / Pause / Resume CTA,
 * Clear-done, Add-pair, and the concurrency segmented control. The bar is
 * also the user-facing source of truth for the "in-flight encodes are
 * draining" copy when soft-pause is engaged.
 */
export const QueueActions = ({
  stats,
  running,
  paused,
  singleEncodeActive = false,
  concurrency,
  onStart,
  onPause,
  onResume,
  onClearDone,
  onAddPair,
  onConcurrencyChange,
}: QueueActionsProps) => {
  const { t } = useTranslation('queue');

  // CTA branch:
  //  · running + paused + active>0 → "Pausing… (N item(s) finishing)"
  //  · running + paused → "Paused — Resume"
  //  · running → "Pause queue"
  //  · idle → "Start queue" (disabled if no waiting items / single-active)
  let ctaLabel: string;
  let ctaTitle: string;
  let ctaDisabled = false;
  let ctaTone: 'primary' | 'ghost' = 'primary';
  let ctaIcon = <IconPlay size={14} />;
  let onCta: () => void = onStart;

  if (running && paused && stats.active > 0) {
    ctaLabel = t('cta.pausing', { count: stats.active });
    ctaTitle = t('cta.pausingTitle');
    ctaDisabled = true;
    ctaIcon = <IconPause size={14} />;
  } else if (running && paused) {
    ctaLabel = t('cta.resumeQueue');
    ctaTitle = t('cta.resumeTitle');
    onCta = onResume;
    ctaIcon = <IconPlay size={14} />;
  } else if (running) {
    ctaLabel = t('cta.pauseQueue');
    ctaTitle = t('cta.pausingTitle');
    onCta = onPause;
    ctaTone = 'ghost';
    ctaIcon = <IconPause size={14} />;
  } else if (singleEncodeActive) {
    ctaLabel = t('cta.startQueue');
    ctaTitle = t('cta.startSingleActive');
    ctaDisabled = true;
  } else if (stats.wait === 0) {
    ctaLabel = t('cta.startQueue');
    ctaTitle = t('cta.startNoItems');
    ctaDisabled = true;
  } else {
    ctaLabel = t('cta.startQueue');
    ctaTitle = t('cta.startItems', { count: stats.wait });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onCta}
        disabled={ctaDisabled}
        title={ctaTitle}
        className={cn(
          'flex items-center gap-2 rounded-md border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] transition',
          ctaDisabled
            ? 'cursor-not-allowed border-border bg-card/30 text-muted opacity-70'
            : ctaTone === 'primary'
              ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-primary hover:bg-[color-mix(in_oklab,var(--primary)_28%,transparent)]'
              : 'border-border bg-card/30 text-foreground hover:border-primary/40'
        )}
      >
        {ctaIcon}
        <span>{ctaLabel}</span>
      </button>

      <button
        type="button"
        onClick={onAddPair}
        className="flex items-center gap-2 rounded-md border border-border bg-card/30 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground transition hover:border-primary/40 hover:text-primary"
      >
        <IconPlus size={14} />
        <span>{t('addPair')}</span>
      </button>

      <button
        type="button"
        onClick={onClearDone}
        disabled={stats.done === 0}
        title={stats.done === 0 ? t('nothingToClear') : t('clearDoneTitle', { count: stats.done })}
        className={cn(
          'flex items-center gap-2 rounded-md border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] transition',
          stats.done === 0
            ? 'cursor-not-allowed border-border bg-card/30 text-muted opacity-50'
            : 'border-border bg-card/30 text-foreground hover:border-destructive/50 hover:text-destructive'
        )}
      >
        <IconTrash size={14} />
        <span>{t('clearDone')}</span>
      </button>

      {/* Concurrency segmented control. Mirrors the Settings screen's
          control — single source of truth = electron-store. */}
      <div className="ml-auto flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          並行 · {t('concurrency')}
        </span>
        <div className="flex gap-0.5 rounded-md border border-border bg-card/30 p-0.5">
          {CONCURRENCY_OPTIONS.map(value => {
            const active = value === concurrency;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onConcurrencyChange(value)}
                title={t('concurrencyTooltip', { count: value })}
                className={cn(
                  'min-w-[28px] rounded-sm px-2 py-1 font-mono text-[11px] transition',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]'
                )}
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
