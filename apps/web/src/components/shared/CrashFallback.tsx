import type { CSSProperties } from 'react';

interface CrashFallbackProps {
  /** Short summary of what went wrong (e.g. the error.message). */
  message?: string;
  /** Called when the user accepts the reload / resume action. */
  onReload?: () => void;
  /** Optional action to fire before reloading (e.g. copy a report). */
  onReport?: () => void;
}

/**
 * Full-screen "something collapsed" fallback — the last line of defence when
 * the main `<ErrorBoundary variant="root">` itself cannot render, or the
 * caller wants a hand-assembled crash screen instead of the default card.
 *
 * Inline-styled on purpose. If the app stylesheet is what broke, the crash
 * screen should still look presentable without it — every rule below reads
 * from CSS custom properties with safe fallbacks.
 */
export const CrashFallback = ({
  message = 'Something collapsed mid-render.',
  onReload = () => window.location.reload(),
  onReport,
}: CrashFallbackProps) => {
  const rootStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: 40,
    background: 'var(--popover, #0a0a12)',
    color: 'var(--foreground, #eaeaf0)',
    fontFamily: 'var(--font-body, system-ui, sans-serif)',
    overflow: 'hidden',
    zIndex: 9999,
  };

  const watermarkStyle: CSSProperties = {
    position: 'absolute',
    left: -60,
    bottom: -120,
    fontFamily: 'var(--font-display, serif)',
    fontSize: 560,
    fontWeight: 800,
    lineHeight: 1,
    color: 'var(--watermark, rgba(255,255,255,0.045))',
    pointerEvents: 'none',
    userSelect: 'none',
    letterSpacing: '-0.05em',
  };

  const contentStyle: CSSProperties = {
    position: 'relative',
    maxWidth: 620,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    zIndex: 1,
  };

  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid var(--border, rgba(255,255,255,0.08))',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: 10,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'var(--muted, #707080)',
    alignSelf: 'flex-start',
  };

  const dotStyle: CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--bad, #e56565)',
    boxShadow: '0 0 8px var(--bad, #e56565)',
  };

  const headlineStyle: CSSProperties = {
    fontFamily: 'var(--font-display, serif)',
    fontWeight: 700,
    fontSize: 64,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    margin: 0,
  };

  const emStyle: CSSProperties = { fontStyle: 'italic', color: 'var(--bad, #e56565)' };

  const subStyle: CSSProperties = {
    fontSize: 16,
    lineHeight: 1.55,
    color: 'var(--muted-foreground, #a0a0b0)',
    margin: 0,
  };

  const actionsStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };

  const primaryBtn: CSSProperties = {
    padding: '12px 20px',
    borderRadius: 10,
    border: '1px solid var(--primary, #8a6dff)',
    background: 'var(--primary, #8a6dff)',
    color: 'var(--primary-foreground, #0a0a12)',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    fontWeight: 600,
    cursor: 'pointer',
  };

  const ghostBtn: CSSProperties = {
    ...primaryBtn,
    background: 'transparent',
    color: 'var(--foreground, #eaeaf0)',
    border: '1px solid var(--border, rgba(255,255,255,0.12))',
  };

  return (
    <div style={rootStyle} role="alert" aria-live="assertive">
      <div aria-hidden="true" style={watermarkStyle}>
        崩
      </div>
      <div style={contentStyle}>
        <span style={pillStyle}>
          <span style={dotStyle} />
          crashed · 崩
        </span>
        <h1 style={headlineStyle}>
          MoeKoder <span style={emStyle}>tripped.</span>
          <br />
          Let's get you moving.
        </h1>
        <p style={subStyle}>{message}</p>
        <div style={actionsStyle}>
          <button type="button" style={primaryBtn} onClick={onReload}>
            再 · Reload app
          </button>
          {onReport && (
            <button type="button" style={ghostBtn} onClick={onReport}>
              告 · Copy report
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
