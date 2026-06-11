import { useTranslation } from 'react-i18next';

/**
 * Step 08 · Privacy. Static consent-style pledge screen. Five pledges
 * (three "no", two "yes") + a closing seal. `canNext` stays true; the
 * parent swaps the footer CTA to "I understand" via `nextLabel`.
 */

interface PledgeItem {
  k: string;
  tone: 'no' | 'yes';
  titleKey: string;
  bodyKey: string;
}

const ITEMS: PledgeItem[] = [
  {
    k: '無',
    tone: 'no',
    titleKey: 'privacy.noAccount.title',
    bodyKey: 'privacy.noAccount.body',
  },
  {
    k: '零',
    tone: 'no',
    titleKey: 'privacy.noTelemetry.title',
    bodyKey: 'privacy.noTelemetry.body',
  },
  {
    k: '否',
    tone: 'no',
    titleKey: 'privacy.noNags.title',
    bodyKey: 'privacy.noNags.body',
  },
  {
    k: '自',
    tone: 'yes',
    titleKey: 'privacy.filesLocal.title',
    bodyKey: 'privacy.filesLocal.body',
  },
  {
    k: '源',
    tone: 'yes',
    titleKey: 'privacy.sourceAvailable.title',
    bodyKey: 'privacy.sourceAvailable.body',
  },
];

export const Privacy = () => {
  const { t } = useTranslation('onboarding');

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">静</span>
        <span>step 08 · privacy</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>静</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          {t('privacy.title')}{' '}
          <em className="not-italic text-primary">{t('privacy.titleEmphasis')}</em>
        </h1>
        <p className="max-w-[720px] text-sm leading-relaxed text-muted-foreground">
          {t('privacy.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          {ITEMS.map(item => (
            <div
              key={item.k}
              className={
                item.tone === 'no'
                  ? 'flex items-start gap-4 rounded-lg border border-border bg-card/35 p-4'
                  : 'flex items-start gap-4 rounded-lg border border-good/35 bg-good/10 p-4'
              }
            >
              <span
                className={
                  item.tone === 'no'
                    ? 'font-display text-4xl leading-none text-muted-foreground'
                    : 'font-display text-4xl leading-none text-good'
                }
              >
                {item.k}
              </span>
              <div className="flex flex-col gap-1">
                <b className="font-display text-base text-foreground">{t(item.titleKey)}</b>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {t(item.bodyKey)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <aside className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/25 p-6 text-center">
          <span className="font-display text-[96px] leading-none text-primary">静</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            静 · sei · stillness
          </span>
          <div className="font-display text-xl leading-snug text-foreground">
            {t('privacy.seal.quiet')}{' '}
            <em className="not-italic text-primary">{t('privacy.seal.quietEmphasis')}</em>
            <br />
            {t('privacy.seal.gone')}{' '}
            <em className="not-italic text-primary">{t('privacy.seal.goneEmphasis')}</em>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {t('privacy.seal.pledge')}
          </span>
        </aside>
      </div>
    </div>
  );
};
