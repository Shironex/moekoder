import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck } from '@/components/ui';
import { useElectronAPI } from '@/hooks';
import { cn } from '@/lib/cn';
import type { GpuProbeResult } from '@/types/electron-api';
import { HW_OPTIONS_TEMPLATE, type HwOption, type HwOptionId } from '../data';

interface HardwareProps {
  /** Currently selected encoder — receive from the parent's wizard store. */
  value: HwOptionId;
  /** Fire when the user clicks a detected card to preview it. */
  onChange: (id: HwOptionId) => void;
  /** Fires once the initial probe settles (ok or error). Parent uses this to
   * enable the Continue button. CPU is always a valid fallback. */
  onProbed: (result: GpuProbeResult | null) => void;
}

/**
 * Merge the static template with the live probe. Vendors the probe flagged
 * true get `detected = true`; the recommended vendor gets `primary`.
 */
const applyProbe = (probe: GpuProbeResult | null): HwOption[] => {
  return HW_OPTIONS_TEMPLATE.map(o => {
    if (!probe) {
      // No probe yet / probe failed — only CPU is known-detected.
      return o.id === 'cpu' ? { ...o } : { ...o, detected: false };
    }
    const detectedMap: Record<HwOptionId, boolean> = {
      nvenc: probe.nvenc,
      qsv: probe.qsv,
      amf: probe.amf,
      cpu: true,
    };
    const detected = detectedMap[o.id];
    const primary = probe.recommended === o.id;
    const chip = detected
      ? o.id === 'cpu'
        ? 'software · always available'
        : `${o.name.split('·')[0]?.trim()} · detected`
      : `${o.name.split('·')[0]?.trim()} · not detected`;
    return { ...o, detected, primary, chip };
  });
};

interface HwCardProps {
  opt: HwOption;
  selected: boolean;
  onClick: () => void;
}

const HwCard = ({ opt, selected, onClick }: HwCardProps) => {
  const disabled = !opt.detected;
  const badgeLabel = disabled
    ? 'not available'
    : selected
      ? 'chosen'
      : opt.primary
        ? 'recommended'
        : 'detected';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-3 rounded-xl border bg-card/30 p-5 text-left transition',
        selected &&
          'border-primary bg-primary/10 shadow-[0_0_32px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)]',
        !selected && !disabled && 'border-border hover:border-primary/60 hover:bg-card/50',
        disabled && 'cursor-not-allowed border-border opacity-55'
      )}
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl leading-none text-primary">{opt.k}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="font-display text-lg text-foreground">{opt.name}</b>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {opt.mono}
          </span>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em]',
            selected && 'border-primary bg-primary/20 text-primary',
            !selected && !disabled && opt.primary && 'border-good/40 bg-good/10 text-good',
            !selected && !disabled && !opt.primary && 'border-border bg-card text-muted-foreground',
            disabled && 'border-border text-muted'
          )}
        >
          {badgeLabel}
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg bg-popover/40 px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          <span>chip</span>
          <b className="font-sans text-[12px] normal-case tracking-normal text-foreground">
            {opt.chip}
          </b>
        </div>
        {opt.specs.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
          >
            <span>{k.toLowerCase()}</span>
            <b className="font-sans text-[12px] normal-case tracking-normal text-foreground">{v}</b>
          </div>
        ))}
      </div>
    </button>
  );
};

/**
 * Step 03 · Hardware. Calls `electronAPI.gpu.probe()` once on mount and
 * merges the result into the hardware-option template. The user can preview
 * any detected vendor by clicking a card (parent persists the selection);
 * CPU is always a valid fallback so the Continue button enables regardless
 * of whether the probe found anything.
 */
export const Hardware = ({ value, onChange, onProbed }: HardwareProps) => {
  const api = useElectronAPI();
  const [probe, setProbe] = useState<GpuProbeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Guard against StrictMode double-invoke firing the probe twice.
  const probedRef = useRef(false);
  const onProbedRef = useRef(onProbed);
  useEffect(() => {
    onProbedRef.current = onProbed;
  }, [onProbed]);

  useEffect(() => {
    if (probedRef.current) return;
    probedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.gpu.probe();
        if (cancelled) return;
        setProbe(result);
        onProbedRef.current(result);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[onboarding/hardware] gpu probe failed', err);
        setProbeError(message);
        onProbedRef.current(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const options = useMemo(() => applyProbe(probe), [probe]);
  const gpuOptions = options.filter(o => o.id !== 'cpu');
  const cpuOption = options.find(o => o.id === 'cpu') ?? { ...HW_OPTIONS_TEMPLATE[3] };

  const recommended = options.find(o => o.primary);
  const recommendedLabel = recommended?.name.split('·')[0]?.trim() ?? 'CPU';

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">核</span>
        <span>step 03 · hardware</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>gpu · 核</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          Picked up your <em className="not-italic text-primary">hardware.</em>
        </h1>
        <p className="max-w-[780px] text-sm leading-relaxed text-muted-foreground">
          We ran a quick probe.{' '}
          {loading ? (
            <>
              <b className="text-foreground">Probing ffmpeg encoders…</b> this takes a second.
            </>
          ) : probeError ? (
            <>
              Probe didn&apos;t return cleanly —{' '}
              <b className="text-foreground">we&apos;ll use CPU (libx264) as a safe fallback.</b>{' '}
              You can change this anytime in Settings.
            </>
          ) : (
            <>
              <b className="text-foreground">{recommendedLabel}</b> is the fastest option on this
              machine — we&apos;ll use it by default. You can change this anytime in Settings.
            </>
          )}
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card/30 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span>probing hardware encoders…</span>
        </div>
      )}

      {!loading && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {gpuOptions.map(opt => (
              <HwCard
                key={opt.id}
                opt={opt}
                selected={value === opt.id}
                onClick={() => opt.detected && onChange(opt.id)}
              />
            ))}
          </div>

          {/* CPU fallback, full-width */}
          <HwCard opt={cpuOption} selected={value === 'cpu'} onClick={() => onChange('cpu')} />

          <div className="flex items-center gap-3 rounded-lg border border-border bg-card/20 px-4 py-3">
            <IconCheck size={16} className="text-primary" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <b className="font-display text-sm text-foreground">CPU is always on</b>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                software · libx264 · fallback is guaranteed
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
