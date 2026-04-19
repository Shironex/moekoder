import { type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { APP_NAME } from '@moekoder/shared';
import { Button, IconCheck, IconClose, IconMax, IconMin } from '@/components/ui';
import { cn } from '@/lib/cn';
import { IS_MAC } from '@/lib/platform';
import { OB_STEPS, type OnboardingStepId, type OnboardingStepMeta } from './data';

/**
 * Curried logger for window-control IPC failures inside onboarding. Mirrors
 * the helper in Titlebar — we never want a stray IPC rejection to surface as
 * an unhandled error during first-launch setup.
 */
const logWinErr =
  (action: string) =>
  (err: unknown): void => {
    console.warn(`[onboarding] window:${action} failed`, err);
  };

interface OnboardingLayoutProps {
  /** Current step id — used to derive rail status + footer affordances. */
  step: OnboardingStepId;
  /** Whether the primary CTA is enabled (varies per step). */
  canNext: boolean;
  /** Called when the user clicks Back. Ignored on the first step. */
  onBack: () => void;
  /** Called when the user clicks Continue / Finish / the step-specific CTA. */
  onNext: () => void;
  /** Called when the user clicks "Skip for now" — only shown if the step is skippable. */
  onSkip?: () => void;
  /** Body content rendered inside the canvas — one per step component. */
  children: ReactNode;
  /**
   * Optional override for the primary CTA label. Defaults cycle:
   * · regular steps → "Continue"
   * · step 8 (privacy) → "I understand"
   * · step 9 (done) → "Start encoding"
   */
  nextLabel?: string;
  /**
   * When true, primary CTA renders a busy state ("Downloading…"). Used by the
   * Engine step while ffmpeg fetch is in-flight.
   */
  busy?: boolean;
}

interface RailEntryProps {
  meta: OnboardingStepMeta;
  status: 'done' | 'current' | 'pending';
}

/**
 * One entry on the progress rail. Three visual states — `done` (solid glyph
 * + check), `current` (outlined primary ring + pulsing dot), `pending`
 * (muted text + dotted ring).
 */
const RailEntry = ({ meta, status }: RailEntryProps) => {
  const node =
    status === 'done' ? (
      <IconCheck size={12} strokeWidth={2.4} />
    ) : (
      <span className="font-display text-sm leading-none">{meta.n}</span>
    );

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 transition',
        status === 'current' && 'bg-card/40',
        status === 'pending' && 'opacity-55'
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition',
          status === 'done' && 'border-primary bg-primary/15 text-primary',
          status === 'current' &&
            'border-primary bg-primary text-primary-foreground shadow-[0_0_16px_color-mix(in_oklab,var(--primary)_45%,transparent)]',
          status === 'pending' && 'border-border bg-card text-muted'
        )}
        aria-hidden="true"
      >
        {node}
      </span>
      <div className="flex flex-col gap-0.5 leading-none">
        <span
          className={cn(
            'font-display text-[15px]',
            status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {meta.label}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted">
          {meta.mono}
        </span>
      </div>
    </div>
  );
};

/**
 * Shared wizard chrome for every onboarding step — full-window takeover with
 * a progress rail on the left, the step body in the canvas, and a footer
 * navigation bar. All style is Tailwind-first; scoped keyframes (breathing
 * watermark) live in a local <style> block to avoid introducing a per-screen
 * CSS file.
 */
export const OnboardingLayout = ({
  step,
  canNext,
  onBack,
  onNext,
  onSkip,
  children,
  nextLabel,
  busy,
}: OnboardingLayoutProps) => {
  const idx = OB_STEPS.findIndex(s => s.id === step);
  const current = OB_STEPS[idx] ?? OB_STEPS[0];
  const isFirst = idx <= 0;
  const isLast = idx === OB_STEPS.length - 1;
  const progressPct = ((idx + 1) / OB_STEPS.length) * 100;

  const resolvedLabel =
    nextLabel ??
    (isLast ? 'Start encoding' : idx === OB_STEPS.length - 2 ? 'Finish setup' : 'Continue');

  const winApi = window.electronAPI?.window;
  const handleMin = (): void => void winApi?.minimize().catch(logWinErr('minimize'));
  const handleMax = (): void => void winApi?.maximize().catch(logWinErr('maximize'));
  const handleClose = (): void => void winApi?.close().catch(logWinErr('close'));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground">
      <style>{`
        @keyframes moekoderObBreathe {
          0%, 100% { opacity: 0.045; transform: scale(1); }
          50%      { opacity: 0.075; transform: scale(1.02); }
        }
        .moekoder-ob-breathe { animation: moekoderObBreathe 7s ease-in-out infinite; }
        @keyframes moekoderObPulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 55%, transparent); }
          50%      { box-shadow: 0 0 0 6px color-mix(in oklab, var(--primary) 0%, transparent); }
        }
        .ob-nodrag { -webkit-app-region: no-drag; }
        .ob-winctl-btn {
          width: 36px;
          height: 32px;
          background: transparent;
          border: 0;
          color: var(--muted-foreground);
          cursor: pointer;
          border-radius: 6px;
          display: grid;
          place-items: center;
          transition: all 0.15s;
        }
        .ob-winctl-btn:hover { background: var(--card); color: var(--foreground); }
        .ob-winctl-btn.close:hover { background: var(--bad); color: white; }
      `}</style>

      {/* Ambient watermark — huge step kanji breathing behind everything. */}
      <span
        aria-hidden="true"
        className="moekoder-ob-breathe pointer-events-none absolute -right-32 top-1/2 z-0 -translate-y-1/2 select-none font-display leading-none text-primary"
        style={{ fontSize: '620px' }}
      >
        {current.kanji}
      </span>

      {/* Titlebar — draggable region. On macOS we reserve ~80px left so the
          brand clears the native traffic lights; on Windows/Linux we render
          our own min/max/close triplet on the right. */}
      <header
        className={cn(
          'relative z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-popover/60 pr-2 backdrop-blur',
          IS_MAC ? 'pl-[86px]' : 'pl-5'
        )}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="font-display text-xl text-primary">夜</span>
        <span className="font-display text-sm text-foreground">{APP_NAME}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          first launch · 初
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span>setup in progress</span>
          <span className="h-1 w-1 rounded-full bg-muted/50" />
          <span className="text-foreground">
            <span className="mr-1 font-display text-sm text-primary">{current.kanji}</span>
            {current.id}
          </span>
        </div>
        {!IS_MAC && (
          <div className="ob-nodrag ml-2 flex items-center">
            <button
              type="button"
              className="ob-winctl-btn"
              onClick={handleMin}
              title="Minimize"
              aria-label="Minimize"
            >
              <IconMin />
            </button>
            <button
              type="button"
              className="ob-winctl-btn"
              onClick={handleMax}
              title="Maximize"
              aria-label="Maximize"
            >
              <IconMax />
            </button>
            <button
              type="button"
              className="ob-winctl-btn close"
              onClick={handleClose}
              title="Close"
              aria-label="Close"
            >
              <IconClose />
            </button>
          </div>
        )}
      </header>

      {/* Main shell — rail + canvas */}
      <div className="relative z-10 flex min-h-0 flex-1">
        {/* Progress rail */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-popover/40 backdrop-blur">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="font-display text-3xl leading-none text-primary">初</span>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-display text-sm text-foreground">Getting set up</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted">
                shō · 初 · first time
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
            {OB_STEPS.map((s, i) => {
              const status: RailEntryProps['status'] =
                i < idx ? 'done' : i === idx ? 'current' : 'pending';
              return <RailEntry key={s.id} meta={s} status={status} />;
            })}
          </div>

          <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
            <div className="flex items-end gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              <span className="font-display text-xl leading-none text-foreground">{idx + 1}</span>
              <span>/ {OB_STEPS.length}</span>
              <span className="ml-auto">progress · 進度</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-card">
              <div
                className="h-full bg-primary transition-[width] duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-12 py-10">{children}</div>

          <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-popover/60 px-8 py-4 backdrop-blur">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              <span className="font-display text-lg text-primary">{current.kanji}</span>
              <span className="text-foreground">
                <b>{current.label}</b>
              </span>
              <span>
                · step {idx + 1} of {OB_STEPS.length}
              </span>
            </div>
            <div className="flex-1" />

            {!isFirst && !isLast && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft size={14} />
                Back
              </Button>
            )}
            {current.skippable && onSkip && !isLast && (
              <Button variant="ghost" size="sm" onClick={onSkip}>
                Skip for now
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={onNext} disabled={busy || !canNext}>
              {busy ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary-foreground/80" />
                  Downloading…
                </>
              ) : (
                <>
                  {resolvedLabel}
                  {!isLast && <ArrowRight size={14} />}
                </>
              )}
            </Button>
          </footer>
        </main>
      </div>
    </div>
  );
};
