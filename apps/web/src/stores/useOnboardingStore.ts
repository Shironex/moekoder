import { create } from 'zustand';
import { DEFAULT_THEME_ID, type ThemeId } from '@moekoder/shared';

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
export type SaveTarget = 'wypalone' | 'same' | 'subbed' | 'custom';
export type Container = 'mp4' | 'mkv' | 'webm';

interface OnboardingInputs {
  themeId: ThemeId;
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
  themeId: DEFAULT_THEME_ID,
  hwChoice: 'cpu',
  presetChoice: 'balanced',
  saveTarget: 'wypalone',
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
