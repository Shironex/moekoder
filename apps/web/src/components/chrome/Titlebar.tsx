import { Subtitles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_EDITION, APP_NAME, APP_SIGIL } from '@moekoder/shared';
import { IconClose, IconHistory, IconMax, IconMin, IconSettings } from '@/components/ui/icons';
import { useWindowControls } from '@/hooks';
import { IS_MAC } from '@/lib/platform';

export type TitlebarRoute = 'single' | 'queue';

interface TitlebarProps {
  /** Currently active route tab. Only rendered when `onRouteChange` is set. */
  route: TitlebarRoute;
  /**
   * Route tab switcher. When omitted, the Single/Queue tab nav is hidden
   * entirely — v0.1.0 ships Single only (Queue lands in v0.3 per the
   * roadmap), so the caller doesn't wire this. Adding it back in the
   * future re-enables the tabs with zero component changes.
   */
  onRouteChange?: (route: TitlebarRoute) => void;
  /** Required — Settings is always reachable from the titlebar. */
  onSettings: () => void;
  /** Optional — opens the subtitle Extract screen (v0.6.0). When omitted the
   *  Extract entry is hidden. */
  onExtract?: () => void;
  /** Optional — History isn't wired until v0.2. */
  onHistory?: () => void;
  /** Window-control overrides. When unset, they fall back to the preload bridge (once it exists) or no-op. */
  onMin?: () => void;
  onMax?: () => void;
  onClose?: () => void;
}

/**
 * Frameless-window chrome. The whole bar is a drag region via
 * `-webkit-app-region: drag` on `.titlebar`; interactive elements inside it
 * opt back into click handling with `-webkit-app-region: no-drag` via CSS
 * (`.title-nav`, `.title-actions`, `.win-controls`).
 *
 * Window-control wiring:
 * - If the caller passes an explicit `onMin` / `onMax` / `onClose`, we use it.
 * - Otherwise we delegate to `electronAPI.window.minimize / maximize / close`.
 *   Each returns a promise; we fire-and-forget inside the click handler and
 *   log failures to the console so cancellation/permission errors are
 *   observable without crashing the UI.
 */
export const Titlebar = ({
  route,
  onRouteChange,
  onSettings,
  onExtract,
  onHistory,
  onMin,
  onMax,
  onClose,
}: TitlebarProps) => {
  const { t } = useTranslation('titlebar');
  const controls = useWindowControls('titlebar');
  const handleMin = onMin ?? controls.onMin;
  const handleMax = onMax ?? controls.onMax;
  const handleClose = onClose ?? controls.onClose;

  return (
    <header className={`titlebar${IS_MAC ? ' titlebar--mac' : ''}`}>
      <div className="brand">
        <span className="kanji-sm">{APP_SIGIL}</span>
        <span>{APP_NAME}</span>
        <span className="brand-sub">
          {APP_SIGIL} · {APP_EDITION}
        </span>
      </div>

      <div className="spacer" />

      {onRouteChange && (
        <>
          <nav className="title-nav" aria-label={t('nav.ariaLabel')}>
            <button
              type="button"
              className={route === 'single' ? 'active' : ''}
              onClick={() => onRouteChange('single')}
            >
              {t('nav.single')}
            </button>
            <button
              type="button"
              className={route === 'queue' ? 'active' : ''}
              onClick={() => onRouteChange('queue')}
            >
              {t('nav.queue')}
            </button>
          </nav>

          <div className="spacer" />
        </>
      )}

      <div className="title-actions">
        {onHistory && (
          <button type="button" className="title-icon-btn" onClick={onHistory} title={t('history')}>
            <IconHistory size={16} />
          </button>
        )}
        {onExtract && (
          <button
            type="button"
            className="title-icon-btn"
            onClick={onExtract}
            title={t('extract')}
            aria-label={t('extract')}
          >
            <Subtitles size={16} />
          </button>
        )}
        <button type="button" className="title-icon-btn" onClick={onSettings} title={t('settings')}>
          <IconSettings size={16} />
        </button>
      </div>

      {!IS_MAC && (
        <div className="win-controls">
          <button
            type="button"
            onClick={handleMin}
            title={t('minimize')}
            aria-label={t('minimize')}
          >
            <IconMin />
          </button>
          <button
            type="button"
            onClick={handleMax}
            title={t('maximize')}
            aria-label={t('maximize')}
          >
            <IconMax />
          </button>
          <button
            type="button"
            className="close"
            onClick={handleClose}
            title={t('close')}
            aria-label={t('close')}
          >
            <IconClose />
          </button>
        </div>
      )}
    </header>
  );
};
