import { useEffect } from 'react';
import { ErrorBoundary } from '@/components/shared';
import { Titlebar } from '@/components/chrome';
import { Ring } from '@/components/ui';
import { useAppStore } from '@/stores';
import { applyTheme } from '@/lib/apply-theme';

/**
 * Phase 4a placeholder. Wires the new foundation modules together at the
 * import level to prove the barrel exports resolve and the CSS split boots
 * cleanly. Screen assembly (splash / onboarding / idle / encoding / done /
 * settings / about) lands in Phase 4b — this whole component will be
 * replaced.
 */
export function App() {
  const themeId = useAppStore(s => s.themeId);

  useEffect(() => {
    void applyTheme(themeId);
  }, [themeId]);

  return (
    <ErrorBoundary variant="root" viewName="root">
      <div className="app-root">
        <Titlebar route="single" onSettings={() => {}} />
        <main
          style={{
            flex: 1,
            display: 'grid',
            placeItems: 'center',
            gap: 24,
            padding: 48,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Phase 4a · foundations ready
          </div>
          <Ring pct={42} eta="2m 13s" />
        </main>
      </div>
    </ErrorBoundary>
  );
}
