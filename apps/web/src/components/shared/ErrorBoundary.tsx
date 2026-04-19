import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, ClipboardCopy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

type ErrorBoundaryVariant = 'root' | 'view';

interface FallbackRenderProps {
  error: Error;
  info: ErrorInfo | null;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * `'root'` wraps the entire app — its primary action is a hard reload.
   * `'view'` wraps a single screen — its primary action calls `onReset`,
   * which typically resets local route state in the parent.
   */
  variant?: ErrorBoundaryVariant;
  /** Human-readable label for the boundary, used in the report payload. */
  viewName?: string;
  /**
   * Completely replace the default fallback with custom content. Use when the
   * fallback doesn't need any error details (or pulls them from elsewhere).
   */
  fallback?: ReactNode;
  /**
   * Render-prop variant of `fallback` — receives the thrown error, the React
   * error info, and a `reset()` helper so custom fallbacks can clear state.
   * When both `fallback` and `fallbackRender` are provided, `fallbackRender`
   * wins because it produces richer output.
   */
  fallbackRender?: (props: FallbackRenderProps) => ReactNode;
  /** Called when the user clicks the "Reset view" action (view variant). */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: ErrorInfo | null;
  reportCopied: boolean;
}

interface FallbackProps {
  error: Error;
  info: ErrorInfo | null;
  viewName: string | undefined;
  variant: ErrorBoundaryVariant;
  onPrimary: () => void;
  onCopyReport: () => void;
  reportCopied: boolean;
}

/**
 * Build a human-readable, clipboard-friendly crash report. We intentionally
 * avoid JSON — when a user pastes it into a GitHub issue we want it to be
 * legible without a formatter.
 */
const buildReport = (error: Error, info: ErrorInfo | null, viewName?: string): string =>
  [
    `View: ${viewName ?? 'unknown'}`,
    `Message: ${error.message}`,
    `Stack: ${error.stack ?? '(no stack)'}`,
    `Component stack: ${info?.componentStack ?? '(none)'}`,
  ].join('\n');

const Fallback = ({
  error,
  info,
  viewName,
  variant,
  onPrimary,
  onCopyReport,
  reportCopied,
}: FallbackProps) => {
  const isRoot = variant === 'root';
  const title = isRoot ? 'Something crashed the app' : 'This view crashed';
  const primaryLabel = isRoot ? 'Reload app' : 'Reset view';

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    ...(isRoot ? { minHeight: '100vh', width: '100vw' } : { flex: 1, minHeight: '100%' }),
    background: 'var(--background, #0a0a12)',
    color: 'var(--foreground, #eaeaf0)',
    fontFamily: 'var(--font-body, system-ui)',
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: isRoot ? 560 : 460,
    background: 'var(--card, #17171f)',
    border: '1px solid var(--border, rgba(255,255,255,0.08))',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <div style={wrapperStyle} role="alert">
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={20} style={{ color: 'var(--bad, #e56565)' }} aria-hidden="true" />
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display, serif)',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {title}
          </h2>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground, #a0a0b0)' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        {viewName && (
          <div
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted, #707080)',
            }}
          >
            View · {viewName}
          </div>
        )}
        <details style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 11 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--muted-foreground, #a0a0b0)' }}>
            Stack trace
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              maxHeight: 200,
              overflow: 'auto',
              background: 'var(--popover, #0d0d14)',
              border: '1px solid var(--border, rgba(255,255,255,0.06))',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.stack ?? '(no stack)'}
            {info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''}
          </pre>
        </details>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" onClick={onPrimary}>
            <RefreshCw size={14} />
            {primaryLabel}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCopyReport}>
            <ClipboardCopy size={14} />
            {reportCopied ? 'Copied' : 'Copy report'}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Class-component error boundary. Mirrors Shiranami's `<ErrorBoundary />`
 * pattern but drops the i18n plumbing (Moekoder is English-only) and the
 * toast dependency — the "Copy report" button toggles its label inline so
 * the user sees immediate feedback.
 *
 * Catches thrown errors from its descendants via React's documented lifecycle
 * (`getDerivedStateFromError` + `componentDidCatch`). It does NOT catch
 * async / Promise rejections — those need to be surfaced explicitly by the
 * call site.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, info: null, reportCopied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info });
    // Local console log — always emitted so dev-tools catch the trace.
    console.error(
      `[ErrorBoundary:${this.props.viewName ?? 'unknown'}]`,
      error,
      info.componentStack
    );
    // Best-effort forward to main process if the surface is already wired;
    // silently no-op otherwise so an early-boot crash still renders the card.
    const reporter = (
      window as unknown as {
        electronAPI?: { app?: { reportRendererError?: (p: unknown) => void } };
      }
    ).electronAPI?.app?.reportRendererError;
    if (typeof reporter === 'function') {
      try {
        reporter({
          viewName: this.props.viewName ?? 'unknown',
          message: error.message,
          stack: error.stack ?? null,
          componentStack: info.componentStack ?? null,
        });
      } catch {
        // Reporting must never itself throw. Swallow.
      }
    }
  }

  reset = (): void => {
    this.setState({ error: null, info: null, reportCopied: false });
    this.props.onReset?.();
  };

  handlePrimary = (): void => {
    if (this.props.variant === 'root') {
      window.location.reload();
    } else {
      this.reset();
    }
  };

  handleCopyReport = async (): Promise<void> => {
    const { error, info } = this.state;
    if (!error) return;
    const payload = buildReport(error, info, this.props.viewName);
    try {
      await navigator.clipboard.writeText(payload);
      this.setState({ reportCopied: true });
    } catch (clipboardErr) {
      console.warn('[ErrorBoundary] clipboard write failed', clipboardErr);
    }
  };

  render(): ReactNode {
    const { error, info, reportCopied } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallbackRender) {
      return this.props.fallbackRender({ error, info, reset: this.reset });
    }
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <Fallback
        error={error}
        info={info}
        viewName={this.props.viewName}
        variant={this.props.variant ?? 'view'}
        onPrimary={this.handlePrimary}
        onCopyReport={this.handleCopyReport}
        reportCopied={reportCopied}
      />
    );
  }
}
