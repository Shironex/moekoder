import { useCallback, useMemo, useState } from 'react';
import { ClipboardCopy, RefreshCw } from 'lucide-react';
import { APP_NAME, APP_SIGIL } from '@moekoder/shared';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { logger } from '@/lib/logger';

const log = logger('crash');

interface CrashFallbackProps {
  /** Underlying error, when available. ErrorBoundary passes this through. */
  error?: Error;
  /** Optional human-friendly summary override. Defaults to `error.message`. */
  message?: string;
  /** Called when the user clicks the reload action. */
  onReload?: () => void;
}

/**
 * Build the clipboard report once per (error, message) pair. Plain text so
 * users can paste it into GitHub issues without a formatter mangling it.
 * Pulls user-agent / platform info from the navigator — `navigator.platform`
 * is deprecated on paper but still the least-bad cross-engine hint we have
 * for "this user's OS bucket" from a renderer context.
 */
const buildReport = (error: Error | undefined, message: string | undefined): string => {
  const ts = new Date().toISOString();
  const name = error?.name ?? 'Error';
  const msg = error?.message ?? message ?? 'Unknown';
  const stack = error?.stack ?? '(no stack)';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '(no navigator)';
  return [
    `MoeKoder crash report`,
    `Timestamp: ${ts}`,
    `Error: ${name}`,
    `Message: ${msg}`,
    `User agent: ${ua}`,
    ``,
    `Stack:`,
    stack,
  ].join('\n');
};

/**
 * Full-screen crash view — ported from `MoeKoder Crash.html` in the design
 * prototype. Split layout: the main narrative column sits on the left
 * (eyebrow, headline, explainer, two actions) with a huge `崩` watermark
 * behind it, and a side column on the right scrolls the error name, message,
 * and stack trace. The stack trace is toggleable so very-long traces don't
 * dominate narrow viewports.
 *
 * Wiring: ErrorBoundary mounts this as its `fallback` and the handlers
 * in this component manage their own local state (copy-confirm + toggle).
 * The Reload button defaults to `window.location.reload` so the boundary
 * can still fall through cleanly even when its own state got wedged.
 */
export const CrashFallback = ({ error, message, onReload }: CrashFallbackProps) => {
  const [copied, setCopied] = useState(false);
  const [showStack, setShowStack] = useState(true);

  const report = useMemo(() => buildReport(error, message), [error, message]);

  const handleReload = useCallback((): void => {
    if (onReload) {
      onReload();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [onReload]);

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      log.warn('clipboard write failed', err);
    }
  }, [report]);

  const headline = message ?? error?.message ?? 'Something collapsed mid-render.';
  const stack = error?.stack ?? '(no stack trace available)';
  const errName = error?.name ?? 'Error';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] grid min-h-screen w-screen grid-cols-1 overflow-hidden bg-background text-foreground lg:grid-cols-[1fr_480px]"
    >
      {/* Huge kanji watermark in the bottom-left, well behind everything. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[120px] -left-[60px] select-none font-display text-[560px] leading-none tracking-[-0.05em] text-bad opacity-[0.06]"
      >
        崩
      </span>

      {/* ──────────────── MAIN — narrative column ──────────────── */}
      <div className="relative z-[1] flex min-h-0 flex-col overflow-y-auto px-12 py-16 lg:px-20 lg:py-24">
        {/* Eyebrow chip */}
        <div className="mb-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em] text-bad">
          <span className="font-display text-base tracking-normal text-bad">崩</span>
          <span className="h-px w-8 bg-bad" />
          <span>unexpected error · hou · collapse</span>
        </div>

        {/* Headline */}
        <h1 className="max-w-[22ch] font-display text-6xl font-bold leading-[0.95] tracking-[-0.03em] text-foreground">
          {APP_NAME} <em className="not-italic italic text-bad">tripped.</em>
          <br />
          Let&apos;s get you moving.
        </h1>

        {/* Sub */}
        <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.55] text-muted-foreground">
          <b className="font-semibold text-foreground">{headline}</b>
          <br />
          <span className="mt-2 block">
            Your settings are safe — they live on disk. Reload the app to start fresh, or copy the
            crash report if you&apos;d like to file an issue.
          </span>
        </p>

        {/* Actions */}
        <div className="mt-10 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" onClick={handleReload}>
            <RefreshCw size={16} />再 · Reload app
          </Button>
          <Button variant="ghost" size="lg" onClick={handleCopy}>
            <ClipboardCopy size={16} />
            {copied ? 'Copied · 済' : '告 · Copy report'}
          </Button>
        </div>

        {/* Aux pills */}
        <div className="mt-10 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          <span className="font-display text-base tracking-normal text-primary">{APP_SIGIL}</span>
          <span>{APP_NAME}</span>
          <span className="h-1 w-1 rounded-full bg-muted/50" />
          <span>session · crashed</span>
        </div>
      </div>

      {/* ──────────────── SIDE — diagnostics column ──────────────── */}
      <aside
        className="relative z-[1] flex min-h-0 flex-col overflow-hidden border-l border-border bg-[color-mix(in_oklab,var(--background)_40%,black_60%)] px-8 py-16 lg:py-24"
        aria-label="Crash diagnostics"
      >
        <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
          <span className="font-display text-2xl leading-none text-primary">診</span>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-display text-[15px] font-semibold text-foreground">
              Diagnostics
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
              shin · diagnosis
            </span>
          </div>
          <span className="ml-auto rounded border border-[color-mix(in_oklab,var(--bad)_40%,transparent)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-bad">
            fatal
          </span>
        </div>

        {/* Error summary */}
        <div className="mb-4 rounded-lg border border-[color-mix(in_oklab,var(--bad)_30%,transparent)] bg-[color-mix(in_oklab,var(--bad)_10%,var(--card))] px-4 py-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-bad">
            {errName}
          </div>
          <div className="break-words font-mono text-[12px] leading-[1.4] text-foreground">
            {error?.message || message || 'An unexpected error occurred.'}
          </div>
        </div>

        {/* Stack toggle */}
        <div className="mb-2 flex items-center gap-2 border-t border-border pt-3">
          <span className="font-display text-base text-primary">録</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            stack trace
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setShowStack(s => !s)}
            className={cn(
              'rounded border border-border bg-transparent px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted transition',
              'hover:border-primary hover:text-primary'
            )}
          >
            {showStack ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* Stack body — collapses to zero height but keeps its role so
            screen-readers still announce state flips. */}
        <pre
          className={cn(
            'min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-[color-mix(in_oklab,var(--background)_70%,black)] p-3 font-mono text-[11px] leading-[1.55] text-muted-foreground transition-opacity',
            showStack ? 'opacity-100' : 'pointer-events-none h-0 flex-none opacity-0'
          )}
        >
          {stack}
        </pre>
      </aside>
    </div>
  );
};
