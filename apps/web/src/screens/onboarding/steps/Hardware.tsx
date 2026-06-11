import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { GpuProbeResult, GpuVendor } from '@/types/electron-api';
import { HW_OPTIONS_TEMPLATE, type HwOption, type HwOptionId } from '../data';

/** Priority order for "recommended" picks when the probe returns multiple
 *  vendors. NVENC first (best anime encoder quality/speed), then QSV (Intel
 *  iGPUs are everywhere), then AMF, then Apple's VideoToolbox. CPU is the
 *  guaranteed fallback handled separately. */
const VENDOR_PRIORITY: GpuVendor[] = ['nvenc', 'qsv', 'amf', 'videotoolbox'];

/** Pick the first available vendor in priority order, or `'cpu'` as a
 *  guaranteed fallback when the probe found nothing hardware-accelerated. */
export const pickRecommended = (available: GpuVendor[]): HwOptionId => {
  for (const vendor of VENDOR_PRIORITY) {
    if (available.includes(vendor)) return vendor as HwOptionId;
  }
  return 'cpu';
};

/** Subset of the parent's hoisted GPU-probe state consumed by this step. */
export interface HardwareProbe {
  result: GpuProbeResult | null;
  loading: boolean;
  error: string | null;
}

interface HardwareProps {
  /** Currently selected encoder — receive from the parent's wizard store. */
  value: HwOptionId;
  /** Fire when the user clicks a detected card to preview it. */
  onChange: (id: HwOptionId) => void;
  /** Fires once the initial probe settles (ok or error). Parent uses this to
   * enable the Continue button. CPU is always a valid fallback. */
  onProbed: (result: GpuProbeResult | null) => void;
  /**
   * Pre-run GPU probe hoisted to Onboarding so this step can render detected
   * cards on first paint instead of flashing "Probing encoders…" while the
   * IPC settles. The probe fires as soon as ffmpeg is confirmed installed
   * (usually before the user reaches step 2 even completes), so by step 3
   * it's almost always done.
   */
  probe: HardwareProbe;
}

/**
 * Merge the static template with the live probe. Vendors in `probe.available`
 * get `detected = true`; the highest-priority available vendor gets `primary`.
 * When no hardware encoders are found, CPU is promoted to `primary` instead.
 */
const applyProbe = (probe: GpuProbeResult | null, t: (key: string) => string): HwOption[] => {
  const available = probe?.available ?? [];
  const recommended = probe ? pickRecommended(available) : 'cpu';
  return HW_OPTIONS_TEMPLATE.map(o => {
    const detected = o.id === 'cpu' ? true : (available as string[]).includes(o.id);
    const primary = recommended === o.id;
    // Device name (e.g. "NVIDIA NVENC") is a product name and stays as-is; only
    // the availability suffix is localized.
    const device = o.name.split('·')[0]?.trim();
    const chip = detected
      ? o.id === 'cpu'
        ? t('hw.chip.always')
        : `${device} · ${t('hw.chip.detected')}`
      : `${device} · ${t('hw.chip.notDetected')}`;
    return { ...o, detected, primary, chip };
  });
};

interface HwCardProps {
  opt: HwOption;
  selected: boolean;
  onClick: () => void;
}

const HwCard = ({ opt, selected, onClick }: HwCardProps) => {
  const { t } = useTranslation('onboarding');
  const disabled = !opt.detected;
  const badgeLabel = disabled
    ? t('hw.badge.notAvailable')
    : selected
      ? t('hw.badge.chosen')
      : opt.primary
        ? t('hw.badge.recommended')
        : t('hw.badge.detected');

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
          <span>{t('hw.specs.chip')}</span>
          <b className="font-sans text-[12px] normal-case tracking-normal text-foreground">
            {opt.chip}
          </b>
        </div>
        {opt.specs.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
          >
            <span>
              {k === 'Encoder'
                ? t('hw.specs.encoder')
                : k === 'Throughput'
                  ? t('hw.specs.throughput')
                  : k.toLowerCase()}
            </span>
            <b className="font-sans text-[12px] normal-case tracking-normal text-foreground">{v}</b>
          </div>
        ))}
      </div>
    </button>
  );
};

/**
 * Step 03 · Hardware. Receives a pre-run GPU probe from the Onboarding parent
 * and merges it into the hardware-option template. The user can preview any
 * detected vendor by clicking a card (parent persists the selection); CPU is
 * always a valid fallback so the Continue button enables regardless of
 * whether the probe found anything.
 *
 * The probe used to run on mount here, which flashed a "Probing encoders…"
 * banner for the second or so the IPC took. Hoisting it up meant it fires
 * immediately after ffmpeg is installed (step 2) and is essentially always
 * done by the time step 3 mounts.
 */
export const Hardware = ({ value, onChange, onProbed, probe }: HardwareProps) => {
  const { t } = useTranslation('onboarding');
  const { result: probeResult, loading, error: probeError } = probe;

  // Keep the latest `onProbed` callback behind a ref so the settle effect can
  // stay in a single-run shape without losing the newest handler on re-render.
  const onProbedRef = useRef(onProbed);
  useEffect(() => {
    onProbedRef.current = onProbed;
  }, [onProbed]);

  // Fire `onProbed` exactly once, when the parent's probe settles. Uses a ref
  // latch instead of a dep-change check so the callback can't double-fire
  // if the probe result object reference changes (memoisation hiccups, etc).
  const settledRef = useRef(false);
  useEffect(() => {
    if (settledRef.current) return;
    if (loading) return;
    settledRef.current = true;
    onProbedRef.current(probeResult);
  }, [loading, probeResult]);

  const options = useMemo(() => applyProbe(probeResult, t), [probeResult, t]);
  const gpuOptions = options.filter(o => o.id !== 'cpu');
  const cpuOption = options.find(o => o.id === 'cpu') ?? { ...HW_OPTIONS_TEMPLATE[3] };

  const recommended = options.find(o => o.primary);
  const recommendedLabel = recommended?.name.split('·')[0]?.trim() ?? 'CPU';

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">核</span>
        <span>step 04 · hardware</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>gpu · 核</span>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-tight text-foreground">
          {t('hw.title')} <em className="not-italic text-primary">{t('hw.titleEmphasis')}</em>
        </h1>
        <p className="max-w-[780px] text-sm leading-relaxed text-muted-foreground">
          {t('hw.subtitlePreamble')}{' '}
          {loading ? (
            <>
              <b className="text-foreground">{t('hw.subtitleProbing')}</b>{' '}
              {t('hw.subtitleProbingSuffix')}
            </>
          ) : probeError ? (
            <>
              {t('hw.subtitleError')}{' '}
              <b className="text-foreground">{t('hw.subtitleErrorEmphasis')}</b>{' '}
              {t('hw.subtitleErrorSuffix')}
            </>
          ) : (
            <>
              <b className="text-foreground">{recommendedLabel}</b> {t('hw.subtitleOk')}
            </>
          )}
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card/30 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span>{t('hw.probingBanner')}</span>
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
              <b className="font-display text-sm text-foreground">{t('hw.cpuAlwaysOn.title')}</b>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                {t('hw.cpuAlwaysOn.mono')}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
