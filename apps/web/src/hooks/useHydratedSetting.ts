import { useEffect, useRef } from 'react';
import type { UserSettings, UserSettingsKey } from '@moekoder/shared';
import { useSetting } from './useSetting';

/**
 * One-shot hydration of an in-memory zustand slice from the persisted
 * `electron-store` value for the same key.
 *
 * `useSetting` hydrates asynchronously and only fires once per mount, so the
 * initial `null` it returns eventually flips to the persisted value and then
 * stays there for the rest of the session. Without the ref guard, any later
 * change to `currentValue` (e.g. the user toggling the theme) would re-fire
 * the effect, see the same stale persisted value, and silently revert the
 * user's pick. The guard ensures the sync runs exactly once — the moment the
 * store read resolves.
 */
export const useHydratedSetting = <K extends UserSettingsKey>(
  key: K,
  currentValue: UserSettings[K],
  setStoreValue: (value: UserSettings[K]) => void
): void => {
  const [persisted] = useSetting(key);
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (persisted === null) return;
    hydratedRef.current = true;
    if (persisted !== currentValue) {
      setStoreValue(persisted);
    }
  }, [persisted, currentValue, setStoreValue]);
};
