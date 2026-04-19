import { APP_EDITION, APP_NAME, APP_SIGIL } from '@moekoder/shared';
import { IconClose, IconHistory, IconMax, IconMin, IconSettings } from '@/components/ui/icons';

export type TitlebarRoute = 'single' | 'queue';

interface TitlebarProps {
  /** Currently active route tab. */
  route: TitlebarRoute;
  /** Optional route tab switcher. Tabs are no-ops without this. */
  onRouteChange?: (route: TitlebarRoute) => void;
  /** Required — Settings is always reachable from the titlebar. */
  onSettings: () => void;
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
 * - Otherwise we look for `window.electronAPI.window.*`. That surface does
 *   not exist in the preload today (it's a Phase 4b/later add), so the
 *   buttons currently render inert. No throw — cosmetic degradation only.
 */
export const Titlebar = ({
  route,
  onRouteChange,
  onSettings,
  onHistory,
  onMin,
  onMax,
  onClose,
}: TitlebarProps) => {
  const winApi = (
    window as unknown as {
      electronAPI?: {
        window?: {
          minimize?: () => void;
          maximize?: () => void;
          close?: () => void;
        };
      };
    }
  ).electronAPI?.window;

  const handleMin = onMin ?? winApi?.minimize ?? (() => {});
  const handleMax = onMax ?? winApi?.maximize ?? (() => {});
  const handleClose = onClose ?? winApi?.close ?? (() => {});

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="kanji-sm">{APP_SIGIL}</span>
        <span>{APP_NAME}</span>
        <span className="brand-sub">
          {APP_SIGIL} · {APP_EDITION}
        </span>
      </div>

      <div className="spacer" />

      <nav className="title-nav" aria-label="Main routes">
        <button
          type="button"
          className={route === 'single' ? 'active' : ''}
          onClick={() => onRouteChange?.('single')}
        >
          Single
        </button>
        <button
          type="button"
          className={route === 'queue' ? 'active' : ''}
          onClick={() => onRouteChange?.('queue')}
        >
          Queue
        </button>
      </nav>

      <div className="spacer" />

      <div className="title-actions">
        {onHistory && (
          <button type="button" className="title-icon-btn" onClick={onHistory} title="History">
            <IconHistory size={16} />
          </button>
        )}
        <button type="button" className="title-icon-btn" onClick={onSettings} title="Settings">
          <IconSettings size={16} />
        </button>
      </div>

      <div className="win-controls">
        <button type="button" onClick={handleMin} title="Minimize" aria-label="Minimize">
          <IconMin />
        </button>
        <button type="button" onClick={handleMax} title="Maximize" aria-label="Maximize">
          <IconMax />
        </button>
        <button
          type="button"
          className="close"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
        >
          <IconClose />
        </button>
      </div>
    </header>
  );
};
