import { useTranslation } from 'react-i18next';
import mascotUrl from '@/assets/mascot.png';
import { LanguagePicker } from '@/components/ui';

/**
 * Step 01 · Welcome. Static intro card — introduces the app, the three
 * things it does, and a "bring your own" disclaimer seal. No user input
 * beyond clicking Continue, so the parent can leave `canNext` at `true`.
 */

interface BulletProps {
  kanji: string;
  title: React.ReactNode;
  body: string;
}

const Bullet = ({ kanji, title, body }: BulletProps) => (
  <div className="flex items-start gap-4 rounded-lg border border-border bg-card/35 p-4">
    <span className="font-display text-4xl leading-none text-primary">{kanji}</span>
    <div className="flex flex-col gap-1">
      <b className="font-display text-base text-foreground">{title}</b>
      <span className="text-sm leading-relaxed text-muted-foreground">{body}</span>
    </div>
  </div>
);

export const Welcome = () => {
  const { t } = useTranslation('onboarding');

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
      {/* Eyebrow */}
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">迎</span>
        <span>step 01 · welcome</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>挨拶</span>
      </div>

      {/* Language picker — placed right after eyebrow so users can switch before reading */}
      <div className="flex flex-col items-start gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          {t('welcome.languageLabel')}
        </span>
        <LanguagePicker ariaLabel={t('welcome.languageLabel')} />
      </div>

      {/* Title + mascot greeting */}
      <div className="flex items-start gap-6">
        <img
          src={mascotUrl}
          alt=""
          aria-hidden="true"
          width={160}
          height={160}
          className="hidden h-[160px] w-[160px] shrink-0 object-contain drop-shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_35%,transparent)] md:block"
        />
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-5xl leading-tight text-foreground">
            {t('welcome.title.greeting')}{' '}
            <em className="not-italic text-primary">{t('welcome.title.kettle')}</em>
          </h1>
          <p className="max-w-[680px] text-base leading-relaxed text-muted-foreground">
            {t('welcome.subtitleIntro')}{' '}
            <b className="text-foreground">{t('welcome.subtitleEmphasis')}</b>
            {'. '}
            {t('welcome.subtitleTrail')}
          </p>
        </div>
      </div>

      {/* Three bullets + seal */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          <Bullet
            kanji="焼"
            title={
              <>
                <em className="not-italic text-primary">{t('welcome.bullets.burns.title')}</em>{' '}
                {t('welcome.bullets.burns.titleSuffix')}
              </>
            }
            body={t('welcome.bullets.burns.body')}
          />
          <Bullet
            kanji="速"
            title={
              <>
                {t('welcome.bullets.gpu.titlePrefix')}{' '}
                <em className="not-italic text-primary">{t('welcome.bullets.gpu.title')}</em>
              </>
            }
            body={t('welcome.bullets.gpu.body')}
          />
          <Bullet
            kanji="夜"
            title={
              <>
                {t('welcome.bullets.quiet.titlePrefix')}{' '}
                <em className="not-italic text-primary">{t('welcome.bullets.quiet.title')}</em>{' '}
                {t('welcome.bullets.quiet.titleSuffix')}
              </>
            }
            body={t('welcome.bullets.quiet.body')}
          />
        </div>

        <aside className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card/25 p-5 text-center">
          <span className="font-display text-6xl leading-none text-primary">持</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {t('welcome.seal.eyebrow')}
          </span>
          <b className="font-display text-xl text-foreground">
            <em className="not-italic text-primary">{t('welcome.seal.titlePrefix')}</em>{' '}
            {t('welcome.seal.titleSuffix')}
          </b>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t('welcome.seal.bodyBefore')}{' '}
            <b className="text-foreground">{t('welcome.seal.bodyEmphasis')}</b>
            {t('welcome.seal.bodyAfter')}
          </p>
        </aside>
      </div>

      {/* What you'll need */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/25 p-5">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          <span className="font-display text-base text-primary">具</span>
          <span>{t('welcome.needs.eyebrow')}</span>
        </div>
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li>
            · <b className="text-foreground">{t('welcome.needs.disk')}</b>{' '}
            {t('welcome.needs.diskSuffix')}
          </li>
          <li>
            · <b className="text-foreground">{t('welcome.needs.network')}</b>{' '}
            {t('welcome.needs.networkSuffix')}
          </li>
          <li>
            · <b className="text-foreground">{t('welcome.needs.time')}</b>{' '}
            {t('welcome.needs.timeSuffix')}
          </li>
        </ul>
      </div>
    </div>
  );
};
