import { useEffect, useMemo, useState } from 'react';
import { APP_NAME, APP_SIGIL } from '@moekoder/shared';
import { cn } from '@/lib/cn';

interface SplashProps {
  /** Called once the boot sequence has finished advancing. */
  onComplete: () => void;
}

interface BootStep {
  id: string;
  k: string;
  msg: string;
  ms: number;
}

/**
 * Canonical boot sequence. Each step ticks through `wait → run → ok`. Timing
 * roughly mirrors a real first launch — 3s end-to-end.
 */
const BOOT_STEPS: BootStep[] = [
  { id: 'bin', k: '録', msg: 'Locating ffmpeg binaries', ms: 620 },
  { id: 'probe', k: '核', msg: 'Probing GPU encoders', ms: 720 },
  { id: 'fonts', k: '字', msg: 'Indexing subtitle fonts', ms: 560 },
  { id: 'theme', k: '色', msg: 'Restoring last session', ms: 480 },
  { id: 'ready', k: '始', msg: 'Ready', ms: 320 },
];

interface Petal {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  spin: number;
  hue: number;
}

/**
 * Build a deterministic-but-visually-random petal set so first render and
 * subsequent renders stay stable — React's StrictMode re-renders in dev
 * would otherwise reshuffle the field and make it flicker.
 */
const buildPetals = (count: number): Petal[] =>
  Array.from({ length: count }).map((_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const r = seed / 233280;
    const r2 = ((seed * 2 + 17) % 233280) / 233280;
    const r3 = ((seed * 3 + 91) % 233280) / 233280;
    return {
      id: i,
      left: Math.round(r * 100),
      size: 14 + Math.round(r2 * 14),
      duration: 11 + r3 * 8,
      delay: -r * 12,
      drift: (r2 - 0.5) * 200,
      spin: 180 + r * 540,
      hue: 50 + Math.round(r2 * 30),
    };
  });

/**
 * Sakura-petal + boot-sequence splash. Keyframes (petalFall + breathe) live
 * in a scoped `<style>` block to avoid introducing a per-screen CSS file —
 * the whole screen ships as one component bundle.
 */
export const SplashScreen = ({ onComplete }: SplashProps) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [outgoing, setOutgoing] = useState(false);
  const petals = useMemo(() => buildPetals(30), []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (stepIdx >= BOOT_STEPS.length) return;
    const step = BOOT_STEPS[stepIdx];
    const t = setTimeout(() => setStepIdx(i => i + 1), step.ms);
    return () => clearTimeout(t);
  }, [stepIdx]);

  useEffect(() => {
    if (stepIdx < BOOT_STEPS.length) return;
    const fade = setTimeout(() => setOutgoing(true), 360);
    const finish = setTimeout(() => onComplete(), 880);
    return () => {
      clearTimeout(fade);
      clearTimeout(finish);
    };
  }, [stepIdx, onComplete]);

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-popover transition-opacity duration-500',
        outgoing ? 'opacity-0' : 'opacity-100'
      )}
    >
      <style>{`
        @keyframes moekoderPetalFall {
          0%   { transform: translate3d(0, -20vh, 0) rotate(0deg); opacity: 0; }
          8%   { opacity: 0.85; }
          92%  { opacity: 0.85; }
          100% { transform: translate3d(var(--drift, 0px), 110vh, 0) rotate(var(--spin, 360deg)); opacity: 0; }
        }
        @keyframes moekoderBreathe {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50%      { transform: scale(1.03); opacity: 1; }
        }
        .moekoder-petal { position: absolute; top: 0; animation-name: moekoderPetalFall; animation-timing-function: linear; animation-iteration-count: infinite; pointer-events: none; }
        .moekoder-breathe { animation: moekoderBreathe 6s ease-in-out infinite; }
      `}</style>

      {/* Ambient corner watermarks */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-16 top-[-60px] select-none font-display text-[380px] leading-none text-primary/[0.045]"
      >
        夜
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 bottom-[-80px] select-none font-display text-[320px] leading-none text-foreground/[0.035]"
      >
        始
      </span>

      {/* Petals */}
      {petals.map(p => (
        <div
          key={p.id}
          className="moekoder-petal"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: `${p.spin}deg`,
          }}
        >
          <svg viewBox="0 0 24 24" width={p.size} height={p.size}>
            <path
              d="M12 2 C14 5, 16 7, 18 7 C20 8, 20 11, 18 13 C19 16, 16 19, 14 18 C13 20, 11 20, 10 18 C8 19, 5 16, 6 13 C4 11, 4 8, 6 7 C8 7, 10 5, 12 2 Z"
              fill={`color-mix(in oklab, var(--primary) ${p.hue}%, white)`}
              opacity="0.72"
            />
            <circle cx="12" cy="12" r="1.2" fill="var(--primary)" opacity="0.55" />
          </svg>
        </div>
      ))}

      {/* Top chrome */}
      <div className="flex items-center gap-3 px-6 py-4">
        <span className="font-display text-xl text-primary">{APP_SIGIL}</span>
        <span className="font-display text-base text-foreground">{APP_NAME}</span>
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-foreground/15" />
          <span className="h-2 w-2 rounded-full bg-foreground/15" />
          <span className="h-2 w-2 rounded-full bg-foreground/15" />
        </div>
      </div>

      {/* Top-left corner mark */}
      <div className="absolute left-6 top-16 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <div className="h-px w-6 bg-border" />
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground">
            <span className="mr-1 font-display text-sm text-primary">初</span> launching
          </span>
          <span>returning · 帰</span>
        </div>
      </div>

      {/* Top-right build info */}
      <div className="absolute right-6 top-16 flex flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <div className="text-foreground">
          <b>v0.1.0</b> <span className="text-muted/70">· moekoder</span>
        </div>
        <div>build {today}</div>
      </div>

      {/* Hero */}
      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="moekoder-breathe font-display text-[220px] leading-none text-primary drop-shadow-[0_0_30px_color-mix(in_oklab,var(--primary)_45%,transparent)]">
          夜
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="font-display text-5xl leading-none text-foreground">
            Moe<em className="not-italic text-primary">Koder</em>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            <b className="text-foreground">v0.1.0</b> · yoru edition
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          <span>subtitle burner</span>
          <span className="h-1 w-1 rounded-full bg-muted/50" />
          <span>
            <span className="mr-1 font-display text-sm text-primary">焼</span> yaku · to burn
          </span>
          <span className="h-1 w-1 rounded-full bg-muted/50" />
          <span>windows</span>
        </div>
      </div>

      {/* Boot sequence */}
      <div className="relative z-[1] mx-auto flex w-full max-w-[540px] flex-col gap-2 px-6 pb-10">
        {BOOT_STEPS.map((s, i) => {
          const status = i < stepIdx ? 'ok' : i === stepIdx ? 'run' : 'wait';
          return (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-3 rounded-sm border border-border bg-card/30 px-3 py-2 transition',
                status === 'wait' && 'opacity-40'
              )}
            >
              <span className="font-display text-lg text-primary">{s.k}</span>
              <span className="flex-1 font-mono text-xs text-foreground">{s.msg}</span>
              <span
                className={cn(
                  'font-mono text-[9px] uppercase tracking-[0.22em]',
                  status === 'ok' && 'text-good',
                  status === 'run' && 'text-primary',
                  status === 'wait' && 'text-muted'
                )}
              >
                {status === 'ok' ? 'done' : status === 'run' ? 'running' : 'wait'}
              </span>
            </div>
          );
        })}
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-card">
          <div
            className="h-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.min(100, (stepIdx / BOOT_STEPS.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-[1] flex items-center justify-between gap-4 border-t border-border px-6 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <div className="flex items-center gap-3">
          <span>
            © 2026 · <b className="text-foreground">{APP_NAME}</b>
          </span>
          <span className="h-1 w-1 rounded-full bg-muted/50" />
          <span>MIT · open source</span>
        </div>
        <div className="flex items-center gap-3">
          <span>powered by ffmpeg</span>
          <span className="h-1 w-1 rounded-full bg-muted/50" />
          <span>{today}</span>
        </div>
      </div>
    </div>
  );
};
