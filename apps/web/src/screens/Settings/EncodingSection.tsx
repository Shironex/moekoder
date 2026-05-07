import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui';
import { useGpuProbe, useSetting } from '@/hooks';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/cn';
import { BenchmarkModal } from './BenchmarkModal';
import {
  CODEC_LABEL,
  CQ_RANGE,
  HW_LABEL,
  LEGAL_HW,
  LIBX265_PRESETS,
  NVENC_ENCODER_NAME,
  SVT_PRESETS,
  TIER_LABEL,
  clampCq,
  codecOf,
  hwAccelOf,
  presetFor,
  presetForHwAccel,
  switchCodec,
  type Codec,
  type HwAccel,
  type Libx265Preset,
  type NvencPreset,
  type SvtPreset,
  type Tier,
} from '@/lib/encoding-profile';
import type { EncodingProfile } from '@moekoder/shared';
import type { GpuVendor } from '@/types/electron-api';

const log = logger('encoding-settings');

const CODEC_OPTIONS: ReadonlyArray<{ value: Codec; label: string }> = [
  { value: 'h264', label: CODEC_LABEL.h264 },
  { value: 'hevc', label: CODEC_LABEL.hevc },
  { value: 'av1', label: CODEC_LABEL.av1 },
];

const TIER_OPTIONS: ReadonlyArray<{ value: Tier; label: string }> = [
  { value: 'fast', label: TIER_LABEL.fast },
  { value: 'balanced', label: TIER_LABEL.balanced },
  { value: 'pristine', label: TIER_LABEL.pristine },
];

const NVENC_PRESET_OPTIONS: ReadonlyArray<NvencPreset> = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

const CONTAINER_OPTIONS: ReadonlyArray<{ value: 'mp4' | 'mkv'; label: string }> = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
];

interface SegmentedProps<T extends string | number> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean; title?: string }>;
  onChange: (next: T) => void;
  ariaLabel: string;
}

const Segmented = <T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-popover/40 p-0.5"
  >
    {options.map(opt => {
      const active = opt.value === value;
      return (
        <button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={active}
          aria-disabled={opt.disabled}
          title={opt.title}
          disabled={opt.disabled}
          onClick={() => !opt.disabled && onChange(opt.value)}
          className={cn(
            'min-w-[44px] rounded-sm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] transition',
            opt.disabled
              ? 'cursor-not-allowed text-muted/40'
              : active
                ? 'bg-primary text-primary-foreground'
                : 'cursor-pointer text-foreground hover:bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]'
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

/**
 * Settings panel for the v0.4 encoding profile. Writes the persisted
 * `encoding` blob in `electron-store` — the orchestrator picks up the
 * shape on every `encode:start` via the wire layer.
 *
 * Design notes:
 *   · The hwAccel options gate on `gpu.probe()` per-encoder names, so a
 *     machine without `av1_nvenc` (i.e. anything pre-RTX 40) sees the AV1
 *     NVENC option disabled with a hover tooltip explaining why.
 *   · Switching codec rebuilds the profile via `switchCodec` so the user
 *     never lands on an illegal combination (libx265 + AV1, etc.) but
 *     keeps their CQ / container / audio choices.
 *   · Quick-set Fast / Balanced / Pristine buttons overwrite the profile
 *     wholesale, so the user can experiment in fine-grained mode and
 *     reset to a tier in one click.
 *   · CQ slider clamps + labels per codec — libsvtav1 goes to 63, the
 *     rest stop at 51.
 */
export const EncodingSection = () => {
  const { result: gpu, probe } = useGpuProbe();
  const [encoding, setEncoding] = useSetting('encoding');
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [activeTier, setActiveTier] = useState<Tier>('balanced');

  // Probe once on mount. Subsequent probes are cheap (the binary output is
  // small) and the user might reinstall ffmpeg between visits — best to
  // re-read on each Settings open.
  useEffect(() => {
    void probe();
  }, [probe]);

  const profile = encoding ?? presetFor('h264', 'balanced');
  const codec = codecOf(profile);
  const hwAccel = hwAccelOf(profile);

  const persist = useCallback(
    (next: EncodingProfile): void => {
      setEncoding(next).catch(err => log.warn('persist encoding failed', err));
    },
    [setEncoding]
  );

  /** Build the disabled / tooltip metadata for each hwAccel option. */
  const hwOptions = useMemo(() => {
    const legal = LEGAL_HW[codec];
    return legal.map(hw => {
      const disabledReason = hwDisabledReason(codec, hw, gpu?.available, gpu?.details);
      return {
        value: hw,
        label: HW_LABEL[hw],
        disabled: Boolean(disabledReason),
        title: disabledReason ?? undefined,
      };
    });
  }, [codec, gpu]);

  const cqRange = CQ_RANGE[hwAccel];

  const onCodecChange = useCallback(
    (next: Codec): void => {
      const available = (gpu?.available ?? []) as ReadonlyArray<HwAccel>;
      const swapped = switchCodec(profile, next, available);
      persist(swapped);
      setActiveTier('balanced');
    },
    [gpu, profile, persist]
  );

  const onHwAccelChange = useCallback(
    (next: HwAccel): void => {
      // Picking a different encoder family within a codec rewrites only the
      // codec-specific knobs; common axes (CQ, container, audio) carry over.
      const branchDefault = presetForHwAccel(codec, next);
      const cq = clampCq((profile?.cq as number | undefined) ?? (branchDefault.cq as number), next);
      persist({
        ...branchDefault,
        cq,
        container:
          (profile?.container as 'mp4' | 'mkv' | undefined) ??
          (branchDefault.container as 'mp4' | 'mkv'),
        audio:
          (profile?.audio as 'copy' | 'aac-192k' | undefined) ??
          (branchDefault.audio as 'copy' | 'aac-192k'),
      });
    },
    [codec, profile, persist]
  );

  const onTierChange = useCallback(
    (tier: Tier): void => {
      // Tier overwrites the entire profile (CQ + preset + audio + container).
      // The user can fine-tune from there.
      persist(presetFor(codec, tier));
      setActiveTier(tier);
    },
    [codec, persist]
  );

  const onCqChange = useCallback(
    (raw: string): void => {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || !profile) return;
      persist({ ...profile, cq: clampCq(parsed, hwAccel) });
    },
    [profile, hwAccel, persist]
  );

  const onNvencPresetChange = useCallback(
    (next: NvencPreset): void => {
      if (!profile) return;
      persist({ ...profile, nvencPreset: next });
    },
    [profile, persist]
  );

  const onLibx265PresetChange = useCallback(
    (next: Libx265Preset): void => {
      if (!profile) return;
      persist({ ...profile, libx265Preset: next });
    },
    [profile, persist]
  );

  const onSvtPresetChange = useCallback(
    (next: SvtPreset): void => {
      if (!profile) return;
      persist({ ...profile, svtPreset: next });
    },
    [profile, persist]
  );

  const onContainerChange = useCallback(
    (next: 'mp4' | 'mkv'): void => {
      if (!profile) return;
      persist({ ...profile, container: next });
    },
    [profile, persist]
  );

  const onTenBitChange = useCallback(
    (next: boolean): void => {
      if (!profile) return;
      persist({ ...profile, tenBit: next });
    },
    [profile, persist]
  );

  const cq = (profile.cq as number | undefined) ?? cqRange.min;
  const container = (profile.container as 'mp4' | 'mkv' | undefined) ?? 'mp4';
  const tenBit = Boolean(profile.tenBit);

  return (
    <div className="flex flex-col gap-5">
      {/* Codec */}
      <Row label="Codec" hint="H.264 is the broadest compat. HEVC saves ~40% size, AV1 ~50%.">
        <Segmented
          value={codec}
          options={CODEC_OPTIONS}
          onChange={onCodecChange}
          ariaLabel="Video codec"
        />
      </Row>

      {/* Hardware encoder */}
      <Row
        label="Encoder"
        hint="Hardware encoders are faster; software encoders give finer quality control. NVENC options disable when your GPU doesn't advertise the encoder."
      >
        <Segmented
          value={hwAccel}
          options={hwOptions}
          onChange={onHwAccelChange}
          ariaLabel="Hardware encoder"
        />
      </Row>

      {/* Tier quick-set */}
      <Row
        label="Quality tier"
        hint="One-click presets per codec. Fast = preview-grade, Balanced = anime-archival default, Pristine = max quality."
      >
        <Segmented
          value={activeTier}
          options={TIER_OPTIONS}
          onChange={onTierChange}
          ariaLabel="Quality tier"
        />
      </Row>

      {/* CQ slider */}
      <Row
        label="Quality (CQ)"
        hint={`Lower = better. Range ${cqRange.min}–${cqRange.max} for the current encoder.`}
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={cqRange.min}
            max={cqRange.max}
            step={1}
            value={cq}
            onChange={e => onCqChange(e.target.value)}
            aria-label="Constant-quality value"
            className="w-[180px] accent-primary"
          />
          <span className="w-[36px] text-right font-mono text-sm text-foreground">{cq}</span>
        </div>
      </Row>

      {/* Encoder-specific preset knob */}
      {hwAccel === 'nvenc' && (
        <Row
          label="NVENC preset"
          hint="Higher numbers = slower + better quality. Anime archival sweet spot is p4–p7."
        >
          <select
            value={(profile.nvencPreset as NvencPreset | undefined) ?? 'p4'}
            onChange={e => onNvencPresetChange(e.target.value as NvencPreset)}
            aria-label="NVENC preset"
            className="rounded-md border border-border bg-card/40 px-3 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {NVENC_PRESET_OPTIONS.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Row>
      )}

      {hwAccel === 'libx265' && (
        <Row
          label="libx265 preset"
          hint="Slower presets give finer compression at the cost of encode time."
        >
          <select
            value={(profile.libx265Preset as Libx265Preset | undefined) ?? 'medium'}
            onChange={e => onLibx265PresetChange(e.target.value as Libx265Preset)}
            aria-label="libx265 preset"
            className="rounded-md border border-border bg-card/40 px-3 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {LIBX265_PRESETS.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Row>
      )}

      {hwAccel === 'libsvtav1' && (
        <Row
          label="SVT-AV1 preset"
          hint="0 = highest quality / slowest, 13 = fastest. Anime archival lands at 4–8."
        >
          <select
            value={String((profile.svtPreset as SvtPreset | undefined) ?? 8)}
            onChange={e => onSvtPresetChange(Number(e.target.value) as SvtPreset)}
            aria-label="SVT-AV1 preset"
            className="rounded-md border border-border bg-card/40 px-3 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {SVT_PRESETS.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Row>
      )}

      {/* 10-bit toggle for HEVC/AV1 NVENC */}
      {(codec === 'hevc' || codec === 'av1') && hwAccel === 'nvenc' && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={tenBit}
            onChange={e => onTenBitChange(e.target.checked)}
          />
          <span className="flex flex-col leading-tight">
            <b className="font-display text-sm text-foreground">10-bit (main10) output</b>
            <span className="text-[12px] text-muted-foreground">
              HEVC + AV1 main10 encodes hold up better in dark scenes. Slightly slower; widely
              supported on modern players.
            </span>
          </span>
        </label>
      )}

      {/* Container */}
      <Row
        label="Container"
        hint="MP4 plays everywhere; MKV preserves the full feature set + supports any audio codec stream-copied."
      >
        <Segmented
          value={container}
          options={CONTAINER_OPTIONS}
          onChange={onContainerChange}
          ariaLabel="Output container"
        />
      </Row>

      {/* Benchmark — opens the modal */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
        <div className="flex max-w-[440px] flex-col gap-1">
          <span className="font-display text-sm text-foreground">Benchmark</span>
          <span className="text-[12px] text-muted-foreground">
            Encode a 10-second sample against three candidate profiles and compare size + time +
            PSNR side-by-side. Results stay in this session.
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setBenchmarkOpen(true)}>
          <Activity size={14} />
          Run benchmark
        </Button>
      </div>

      <BenchmarkModal open={benchmarkOpen} onClose={() => setBenchmarkOpen(false)} />
    </div>
  );
};

interface RowProps {
  label: string;
  hint: string;
  children: React.ReactNode;
}

const Row = ({ label, hint, children }: RowProps) => (
  <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
    <div className="flex max-w-[440px] flex-col gap-1">
      <span className="font-display text-sm text-foreground">{label}</span>
      <span className="text-[12px] text-muted-foreground">{hint}</span>
    </div>
    {children}
  </div>
);

/**
 * Returns a human-readable reason a (codec, hwAccel) tuple is unavailable
 * given the current GPU probe. Returns null when the option is allowed.
 */
const hwDisabledReason = (
  codec: Codec,
  hwAccel: HwAccel,
  available: ReadonlyArray<GpuVendor> | undefined,
  details: Record<GpuVendor, { encoders: string[] } | null> | undefined
): string | null => {
  // Software paths are always available.
  if (hwAccel === 'libx264' || hwAccel === 'libx265' || hwAccel === 'libsvtav1') return null;
  if (!available) return 'Detecting GPU…';
  if (hwAccel === 'qsv') {
    return available.includes('qsv') ? null : 'No Intel QSV encoder detected';
  }
  if (hwAccel === 'nvenc') {
    if (!available.includes('nvenc')) return 'No NVENC encoder detected';
    const wanted = NVENC_ENCODER_NAME[codec];
    const have = details?.nvenc?.encoders ?? [];
    if (have.includes(wanted)) return null;
    if (codec === 'av1') return 'AV1 NVENC requires an RTX 40-series GPU';
    if (codec === 'hevc') return 'HEVC NVENC not available on this GPU';
    return 'H.264 NVENC not available';
  }
  return null;
};
