import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface EngineGateProps {
  /** When true, the gate renders "Checking…" and disables the CTA. */
  probing: boolean;
  onInstall: () => void;
}

/**
 * First-launch gate for the Engine onboarding step. Shown before the user
 * confirms the download — split out of the main layout so the "we're about
 * to do a thing" moment is visually distinct from the progress view.
 */
export const EngineGate = ({ probing, onInstall }: EngineGateProps) => {
  const { t } = useTranslation('onboarding');

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">引</span>
        <span>step 03 · engine</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>ffmpeg + ffprobe</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          {probing ? (
            <>
              {t('engine.gate.titleProbing')}{' '}
              <em className="not-italic text-primary">{t('engine.gate.titleProbingEmphasis')}</em>
            </>
          ) : (
            <>
              {t('engine.gate.titleReady')}{' '}
              <em className="not-italic text-primary">{t('engine.gate.titleReadyEmphasis')}</em>
            </>
          )}
        </h1>
        <p className="max-w-[640px] text-sm leading-relaxed text-muted-foreground">
          {t('engine.gate.subtitleIntro')}{' '}
          <b className="text-foreground">{t('engine.gate.subtitleTools')}</b>{' '}
          {t('engine.gate.subtitleDesc')}{' '}
          <b className="text-foreground">{t('engine.gate.subtitleBuild')}</b>{' '}
          {t('engine.gate.subtitleVerify')}{' '}
          <b className="text-foreground">{t('engine.gate.subtitleSize')}</b>
          {t('engine.gate.subtitleNeverAgain')}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-5">
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl leading-none text-primary">具</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="font-display text-base text-foreground">{t('engine.gate.willInstall')}</b>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              {t('engine.gate.destination')}
            </span>
          </div>
        </div>
        <ul className="flex flex-col gap-2 font-mono text-[11.5px] text-muted-foreground">
          <li className="flex items-center gap-3">
            <span className="font-display text-primary">録</span>
            <b className="font-sans text-[13px] text-foreground">ffmpeg.exe</b>
            <span className="text-muted">{t('engine.gate.ffmpegDesc')}</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="font-display text-primary">測</span>
            <b className="font-sans text-[13px] text-foreground">ffprobe.exe</b>
            <span className="text-muted">{t('engine.gate.ffprobeDesc')}</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="font-display text-primary">印</span>
            <b className="font-sans text-[13px] text-foreground">sha-256 verify</b>
            <span className="text-muted">{t('engine.gate.shaDesc')}</span>
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted">
          {probing ? t('engine.gate.lookingForInstall') : t('engine.gate.readyWhenYouAre')}
        </span>
        <Button variant="primary" size="lg" disabled={probing} onClick={onInstall}>
          <Download size={15} />
          {probing ? t('engine.gate.checking') : t('engine.gate.installFfmpeg')}
        </Button>
      </div>
    </div>
  );
};
