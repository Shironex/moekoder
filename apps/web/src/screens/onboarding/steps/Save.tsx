import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconFolder } from '@/components/ui';
import { useElectronAPI } from '@/hooks';
import { cn } from '@/lib/cn';
import { logger } from '@/lib/logger';
import { OB_SAVES, type ObSaveId } from '../data';

const log = logger('onboarding/save');

interface SaveStepProps {
  value: ObSaveId;
  customPath: string | null;
  onChange: (id: ObSaveId) => void;
  onCustomPath: (path: string | null) => void;
}

/**
 * Step 06 · Save target. Four-option radio list. The `custom` option lifts
 * the OS folder picker via `electronAPI.dialog.openFolder()` and mirrors
 * the chosen path back into the onboarding store.
 */
export const Save = ({ value, customPath, onChange, onCustomPath }: SaveStepProps) => {
  const { t } = useTranslation('onboarding');
  const api = useElectronAPI();

  const pickFolder = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFolder({});
      if (res.canceled || !res.folderPath) return;
      onCustomPath(res.folderPath);
      onChange('custom');
    } catch (err) {
      log.error('dialog.openFolder failed', err);
    }
  }, [api, onChange, onCustomPath]);

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">箱</span>
        <span>step 06 · save location</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>出力</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          {t('save.title')} <em className="not-italic text-primary">{t('save.titleEmphasis')}</em>
        </h1>
        <p className="max-w-[720px] text-sm leading-relaxed text-muted-foreground">
          {t('save.subtitleBefore')} <b className="text-foreground">{t('save.subtitleBeside')}</b>{' '}
          {t('save.subtitleMid')}{' '}
          <code className="font-mono text-[12px] text-foreground">{t('save.subtitleFolder')}</code>{' '}
          {t('save.subtitleAfter')}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {OB_SAVES.map(s => {
          const selected = value === s.id;
          const isCustom = s.id === 'custom';
          const pathText = s.path ?? customPath ?? t('save.browsePlaceholder');
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              aria-pressed={selected}
              className={cn(
                'flex w-full items-start gap-4 rounded-xl border bg-card/30 p-4 text-left transition',
                selected
                  ? 'border-primary bg-primary/10 shadow-[0_0_32px_-12px_color-mix(in_oklab,var(--primary)_55%,transparent)]'
                  : 'border-border hover:border-primary/60 hover:bg-card/50'
              )}
            >
              <span
                className={cn(
                  'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  selected ? 'border-primary' : 'border-border'
                )}
                aria-hidden="true"
              >
                {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="font-display text-3xl leading-none text-primary">{s.k}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <b className="font-display text-base text-foreground">{t(s.labelKey)}</b>
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {isCustom && !customPath ? <em className="not-italic">{pathText}</em> : pathText}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {value === 'custom' && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card/30 p-3">
          <IconFolder size={18} className="text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
            {customPath ?? t('save.noFolderPicked')}
          </span>
          <Button variant="primary" size="sm" onClick={pickFolder}>
            <IconFolder size={14} />
            {customPath ? t('save.change') : t('save.browseEllipsis')}
          </Button>
        </div>
      )}
    </div>
  );
};
