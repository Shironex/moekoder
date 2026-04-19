import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  USER_SETTINGS_DEFAULTS,
  type UserSettings,
  type UserSettingsKey,
} from '@moekoder/shared';
import { deleteSetting, getSetting, setSetting } from '../../store';
import { IpcError } from '../errors';
import { handle } from '../with-ipc-handler';
import { storeDeleteSchema, storeGetSchema, storeSetSchema } from '../schemas/store.schemas';
import type { IpcContext } from '../register';

/** Known renderer-accessible settings keys, derived from the shared defaults. */
const USER_SETTINGS_KEYS = new Set<string>(Object.keys(USER_SETTINGS_DEFAULTS));

function assertUserSettingsKey(key: string): UserSettingsKey {
  if (!USER_SETTINGS_KEYS.has(key)) {
    throw new IpcError('INVALID_INPUT', `Unknown settings key: "${key}"`);
  }
  return key as UserSettingsKey;
}

export function registerStoreHandlers(_ctx: IpcContext): void {
  handle<[string], UserSettings[UserSettingsKey]>(
    IPC_CHANNELS.STORE_GET,
    storeGetSchema,
    (_event, key) => {
      const settingsKey = assertUserSettingsKey(key);
      return getSetting(settingsKey);
    }
  );

  handle<[string, unknown], void>(IPC_CHANNELS.STORE_SET, storeSetSchema, (_event, key, value) => {
    const settingsKey = assertUserSettingsKey(key);
    // electron-store persists whatever the renderer sends; we keep this as
    // `unknown` at the IPC boundary because per-key value validation is
    // cheap to add per-feature later but over-engineered here.
    setSetting(settingsKey, value as UserSettings[typeof settingsKey]);
  });

  handle<[string], void>(IPC_CHANNELS.STORE_DELETE, storeDeleteSchema, (_event, key) => {
    const settingsKey = assertUserSettingsKey(key);
    deleteSetting(settingsKey);
  });
}

export function cleanupStoreHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.STORE_GET);
  ipcMain.removeHandler(IPC_CHANNELS.STORE_SET);
  ipcMain.removeHandler(IPC_CHANNELS.STORE_DELETE);
}
