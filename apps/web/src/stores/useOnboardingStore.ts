import { create } from 'zustand';
import type { SaveTarget } from '@moekoder/shared';

/**
 * Ordered onboarding steps. The wizard walks them 1 -> 1 with no branching;
 * `done` is the terminal state right before `markCompleted()` flips the
 * persisted `hasCompletedOnboarding` flag.
 */
export type OnboardingStep =
  | 'welcome'
  | 'engine'
  | 'hw'
  | 'theme'
  | 'preset'
  | 'save'
  | 'cont'
  | 'privacy'
  | 'done';

export type HwChoice = 'nvenc' | 'qsv' | 'amf' | 'cpu';
export type PresetChoice = 'fast' | 'balanced' | 'pristine';
export type Container = 'mp4' | 'mkv' | 'webm';

export type { SaveTarget };

/**
 * Wizard-only inputs. `themeId` intentionally does NOT live here — the
 * active theme is owned by `useAppStore`, which the Theme step both reads
 * from and writes to. Keeping two theme sources in sync proved brittle
 * (replay-onboarding would show the wrong "selected" card because the
 * onboarding default overrode the real app theme).
 */
interface OnboardingInputs {
  hwChoice: HwChoice;
  presetChoice: PresetChoice;
  saveTarget: SaveTarget;
  customSavePath: string | null;
  container: Container;
}

interface OnboardingState {
  step: OnboardingStep;
  completed: boolean;
  inputs: OnboardingInputs;
  setStep: (step: OnboardingStep) => void;
  setInput: <K extends keyof OnboardingInputs>(key: K, value: OnboardingInputs[K]) => void;
  markCompleted: () => void;
  reset: () => void;
}

const DEFAULT_INPUTS: OnboardingInputs = {
  hwChoice: 'cpu',
  presetChoice: 'balanced',
  saveTarget: 'moekoder',
  customSavePath: null,
  container: 'mp4',
};

export const useOnboardingStore = create<OnboardingState>(set => ({
  step: 'welcome',
  completed: false,
  inputs: DEFAULT_INPUTS,
  setStep: step => set({ step }),
  setInput: (key, value) => set(s => ({ inputs: { ...s.inputs, [key]: value } })),
  markCompleted: () => set({ completed: true }),
  reset: () => set({ step: 'welcome', completed: false, inputs: DEFAULT_INPUTS }),
}));
