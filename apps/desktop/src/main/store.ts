import Store from 'electron-store';
import { USER_SETTINGS_DEFAULTS, type UserSettings, type UserSettingsKey } from '@moekoder/shared';

/**
 * Typed wrapper around the persistent `electron-store`.
 *
 * The store name `settings` maps to `<userData>/settings.json`. The shape
 * and defaults live in `@moekoder/shared/settings` so the preload and
 * renderer can import them without pulling in Electron.
 */
const store = new Store<UserSettings>({
  name: 'settings',
  defaults: USER_SETTINGS_DEFAULTS,
});

export const getSetting = <K extends UserSettingsKey>(key: K): UserSettings[K] => store.get(key);

export const setSetting = <K extends UserSettingsKey>(key: K, value: UserSettings[K]): void => {
  store.set(key, value);
};

export const deleteSetting = (key: UserSettingsKey): void => {
  // electron-store's `delete` restores the default on next `get`.
  store.delete(key);
};

/**
 * Subscribe to changes for a single settings key. Wraps electron-store's
 * `onDidChange` so other main-process modules can react to renderer-driven
 * setting writes without threading a new IPC channel. Returns an unsubscribe
 * function.
 */
export const onSettingChange = <K extends UserSettingsKey>(
  key: K,
  handler: (next: UserSettings[K] | undefined, prev: UserSettings[K] | undefined) => void
): (() => void) => store.onDidChange(key, handler);
