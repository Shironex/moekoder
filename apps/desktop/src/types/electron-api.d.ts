/**
 * Ambient type declarations for the `window.electronAPI` surface exposed by
 * the preload script (`src/main/preload.ts`). Kept in sync manually because
 * the preload runs in a separate compilation unit from the renderer.
 */
import type {
  UserSettings,
  UserSettingsKey,
  UpdaterEventChannel,
  UPDATER_EVENT_CHANNELS,
} from '@moekoder/shared';

export interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
  };
  dialog: {
    openFile: () => Promise<string | null>;
    saveFile: () => Promise<string | null>;
    openFolder: () => Promise<string | null>;
  };
  store: {
    get: <K extends UserSettingsKey>(key: K) => Promise<UserSettings[K]>;
    set: <K extends UserSettingsKey>(key: K, value: UserSettings[K]) => Promise<void>;
    delete: (key: UserSettingsKey) => Promise<void>;
  };
  updater: {
    check: () => Promise<void>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    on: (channel: UpdaterEventChannel, handler: (payload: unknown) => void) => () => void;
  };
  updaterEvents: typeof UPDATER_EVENT_CHANNELS;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
