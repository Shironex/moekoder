import { useCallback, useMemo, useState } from 'react';
import type { ThemeId } from '@moekoder/shared';
import { useAppStore, useOnboardingStore } from '@/stores';
import { useElectronAPI } from '@/hooks';
import { applyTheme, persistTheme } from '@/lib/apply-theme';
import type { GpuProbeResult } from '@/types/electron-api';
import { OB_STEPS } from './data';
import { OnboardingLayout } from './OnboardingLayout';
import { Welcome } from './steps/Welcome';
import { Engine } from './steps/Engine';
import { Hardware, pickRecommended } from './steps/Hardware';
import { Theme } from './steps/Theme';
import { Preset } from './steps/Preset';
import { Save } from './steps/Save';
import { Container } from './steps/Container';
import { Privacy } from './steps/Privacy';
import { Done } from './steps/Done';

/**
 * Top-level onboarding screen. Reads the wizard step from `useOnboardingStore`,
 * advances / retreats with keyboard + footer controls, and on finish:
 * persists `hasCompletedOnboarding` via the electron-store bridge, flips
 * `markCompleted()` in the wizard store, and transitions the app view to
 * `single-idle`. The theme is already persisted per-pick through
 * `persistTheme` in `onThemePick`, so `finish()` doesn't need to re-save it.
 *
 * Wizard inputs that don't yet have a matching `UserSettings` key (preset,
 * save target, container, custom save path, hardware choice) are kept only
 * in the in-memory onboarding store — TODOs tracked for v0.2 once those
 * settings surfaces land.
 */
export const Onboarding = () => {
  const api = useElectronAPI();
  const step = useOnboardingStore(s => s.step);
  const setStep = useOnboardingStore(s => s.setStep);
  const inputs = useOnboardingStore(s => s.inputs);
  const setInput = useOnboardingStore(s => s.setInput);
  const markCompleted = useOnboardingStore(s => s.markCompleted);
  const setView = useAppStore(s => s.setView);
  const themeId = useAppStore(s => s.themeId);
  const setThemeId = useAppStore(s => s.setThemeId);

  const idx = OB_STEPS.findIndex(s => s.id === step);
  const currentStep = OB_STEPS[Math.max(0, idx)];

  // Gate the Continue CTA per step. Engine and Hardware flip it once their
  // async work settles; the pick steps have defaults so they stay enabled.
  const [engineReady, setEngineReady] = useState(false);
  const [probeSettled, setProbeSettled] = useState(false);
  const canNext = useMemo(() => {
    switch (currentStep.id) {
      case 'engine':
        return engineReady;
      case 'hw':
        return probeSettled;
      default:
        return true;
    }
  }, [currentStep.id, engineReady, probeSettled]);

  const advance = useCallback((): void => {
    const nextIdx = idx + 1;
    if (nextIdx >= OB_STEPS.length) return;
    setStep(OB_STEPS[nextIdx].id);
  }, [idx, setStep]);

  const retreat = useCallback((): void => {
    const prevIdx = idx - 1;
    if (prevIdx < 0) return;
    setStep(OB_STEPS[prevIdx].id);
  }, [idx, setStep]);

  const onThemePick = useCallback(
    (id: ThemeId): void => {
      setThemeId(id);
      applyTheme(id);
      void persistTheme(id);
    },
    [setThemeId]
  );

  const finish = useCallback(async (): Promise<void> => {
    try {
      // `themeId` is persisted per-pick in `onThemePick`, so only the
      // completion flag needs flipping here.
      await api.store.set('hasCompletedOnboarding', true);
    } catch (err) {
      console.error('[onboarding] persist failed', err);
      // Swallow — we don't want a store blip to block the user from using
      // the app. The onboarding store still marks complete in memory; the
      // flag reconciles on the next successful write.
    }
    markCompleted();
    setView('single-idle');
  }, [api, markCompleted, setView]);

  const handleNext = useCallback((): void => {
    if (currentStep.id === 'done') {
      void finish();
      return;
    }
    advance();
  }, [currentStep.id, advance, finish]);

  const handleSkip = useCallback((): void => {
    if (!currentStep.skippable) return;
    advance();
  }, [currentStep.skippable, advance]);

  const renderStep = (): React.ReactNode => {
    switch (currentStep.id) {
      case 'welcome':
        return <Welcome />;
      case 'engine':
        return <Engine onReady={() => setEngineReady(true)} />;
      case 'hw':
        return (
          <Hardware
            value={inputs.hwChoice}
            onChange={v => setInput('hwChoice', v)}
            onProbed={(result: GpuProbeResult | null) => {
              if (result) {
                setInput('hwChoice', pickRecommended(result.available));
              }
              setProbeSettled(true);
            }}
          />
        );
      case 'theme':
        return <Theme value={themeId} onChange={onThemePick} />;
      case 'preset':
        return <Preset value={inputs.presetChoice} onChange={v => setInput('presetChoice', v)} />;
      case 'save':
        return (
          <Save
            value={inputs.saveTarget}
            customPath={inputs.customSavePath}
            onChange={v => setInput('saveTarget', v)}
            onCustomPath={v => setInput('customSavePath', v)}
          />
        );
      case 'cont':
        return <Container value={inputs.container} onChange={v => setInput('container', v)} />;
      case 'privacy':
        return <Privacy />;
      case 'done':
        return <Done inputs={{ ...inputs, themeId }} />;
      default:
        return null;
    }
  };

  // Per-step CTA label / skip affordance overrides.
  const nextLabel = ((): string | undefined => {
    if (currentStep.id === 'privacy') return 'I understand';
    if (currentStep.id === 'done') return 'Start encoding';
    return undefined;
  })();

  const onSkip = currentStep.skippable ? handleSkip : undefined;

  return (
    <OnboardingLayout
      step={currentStep.id}
      canNext={canNext}
      onBack={retreat}
      onNext={handleNext}
      onSkip={onSkip}
      nextLabel={nextLabel}
    >
      {renderStep()}
    </OnboardingLayout>
  );
};
