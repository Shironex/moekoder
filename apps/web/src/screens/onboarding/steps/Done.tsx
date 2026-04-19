import { THEMES_BY_ID, type ThemeId } from '@moekoder/shared';
import {
  HW_OPTIONS_TEMPLATE,
  OB_CONTS,
  OB_PRESETS,
  OB_SAVES,
  type HwOption,
  type HwOptionId,
  type ObContainerExt,
  type ObPresetId,
  type ObSaveId,
} from '../data';

interface DoneProps {
  /** Current wizard selections — rendered as summary chips. */
  inputs: {
    hwChoice: HwOptionId;
    themeId: ThemeId;
    presetChoice: ObPresetId;
    saveTarget: ObSaveId;
    container: ObContainerExt;
  };
  /** Optional override for the detected-hardware list (used when probe ran). */
  hwOptions?: HwOption[];
}

interface ChipProps {
  k: string;
  label: string;
  value: React.ReactNode;
}

const Chip = ({ k, label, value }: ChipProps) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
    <span className="font-display text-sm text-primary">{k}</span>
    <span>{label}</span>
    <b className="font-sans text-[12px] normal-case tracking-normal text-foreground">{value}</b>
  </span>
);

/**
 * Step 09 · Done. Completion state: success kanji, a chip summary of the
 * choices, and a drop-target preview. The parent's `onNext` is the one that
 * actually persists the choices + flips `hasCompletedOnboarding` — this
 * component just renders.
 */
export const Done = ({ inputs, hwOptions = [...HW_OPTIONS_TEMPLATE] }: DoneProps) => {
  const hw = hwOptions.find(o => o.id === inputs.hwChoice) ?? hwOptions[hwOptions.length - 1];
  const preset = OB_PRESETS.find(p => p.id === inputs.presetChoice) ?? OB_PRESETS[1];
  const save = OB_SAVES.find(s => s.id === inputs.saveTarget) ?? OB_SAVES[0];
  const cont = OB_CONTS.find(c => c.ext === inputs.container) ?? OB_CONTS[0];
  const theme = THEMES_BY_ID[inputs.themeId];

  const hwShort = hw.name.split('·')[0]?.trim() ?? hw.name;
  const saveShort = save.label.split('·')[0]?.trim() ?? save.label;

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-8 text-center">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span className="font-display text-lg text-primary">始</span>
        <span>step 09 · all set</span>
        <span className="h-1 w-1 rounded-full bg-muted/50" />
        <span>始</span>
      </div>

      <div className="font-display text-[180px] leading-none text-primary drop-shadow-[0_0_30px_color-mix(in_oklab,var(--primary)_40%,transparent)]">
        始
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-5xl leading-tight text-foreground">
          Ready <em className="not-italic text-primary">when you</em> are.
        </h1>
        <p className="max-w-[620px] text-base leading-relaxed text-muted-foreground">
          Everything&apos;s wired up. Hit <b className="text-foreground">Start encoding</b> to pick
          your first video and subtitle — the pipeline takes it from there.
        </p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Chip k={hw.k} label="encoder" value={hwShort} />
        <Chip k={preset.k} label="preset" value={preset.name} />
        <Chip k="器" label="container" value={`.${cont.ext}`} />
        <Chip k={save.k} label="save" value={saveShort} />
        <Chip k={theme.kanji} label="theme" value={theme.name} />
      </div>
    </div>
  );
};
