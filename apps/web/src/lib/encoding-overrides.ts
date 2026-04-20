import type { ContainerChoice, HwChoice, PresetChoice } from '@moekoder/shared';

/**
 * Renderer-side mirror of the subset of `EncodingSettings` the UI can
 * override. The real type lives on the main process (`ffmpeg/settings`);
 * we redeclare the relevant fields here so the renderer bundle never needs
 * to import from main.
 */
export interface EncodingOverride {
  hwAccel?: 'nvenc' | 'qsv' | 'libx264';
  container?: 'mp4' | 'mkv';
  cq?: number;
  nvencPreset?: 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7';
}

/**
 * Map the onboarding `HwChoice` onto the backend `hwAccel` axis. AMF and
 * "cpu" both fall back to `libx264`: v0.1 doesn't have an AMF path wired
 * and "cpu" is our user-facing label for the software encoder.
 */
const hwAccelFor = (hw: HwChoice): EncodingOverride['hwAccel'] => {
  switch (hw) {
    case 'nvenc':
      return 'nvenc';
    case 'qsv':
      return 'qsv';
    case 'amf':
    case 'cpu':
      return 'libx264';
  }
};

/**
 * Translate a preset choice into concrete rate-control knobs. NVENC preset
 * tokens (`p2`/`p4`/`p7`) mirror the onboarding Preset step's published
 * specs; CQ values are the targets a seasoned anime ripper would pick at
 * each quality rung.
 */
const knobsForPreset = (preset: PresetChoice): Pick<EncodingOverride, 'cq' | 'nvencPreset'> => {
  switch (preset) {
    case 'fast':
      return { cq: 23, nvencPreset: 'p2' };
    case 'balanced':
      return { cq: 19, nvencPreset: 'p4' };
    case 'pristine':
      return { cq: 16, nvencPreset: 'p7' };
  }
};

/**
 * Translate the onboarding container pick into a backend-accepted value.
 * `webm` is accepted in the UI so Onboarding reads like the aspirational
 * v0.4 roadmap, but v0.1 silently falls it back to MP4 — the backend
 * doesn't have a WebM muxer path yet.
 */
const containerFor = (container: ContainerChoice): EncodingOverride['container'] => {
  if (container === 'webm') return 'mp4';
  return container;
};

/**
 * Build a `Partial<EncodingSettings>` override from the three persisted
 * onboarding picks. Inputs are nullable because `useSetting` hydrates
 * asynchronously — callers pass whatever they have and the builder skips
 * the unset slots, letting the backend's BALANCED_PRESET fill the gaps.
 */
export const buildEncodingOverrides = (
  hw: HwChoice | null,
  preset: PresetChoice | null,
  container: ContainerChoice | null
): EncodingOverride => {
  const override: EncodingOverride = {};
  if (hw) override.hwAccel = hwAccelFor(hw);
  if (preset) Object.assign(override, knobsForPreset(preset));
  if (container) override.container = containerFor(container);
  return override;
};
