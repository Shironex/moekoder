import { create } from 'zustand';
import { DEFAULT_THEME_ID, type ThemeId } from '@moekoder/shared';

export type AppView =
  | 'splash'
  | 'onboarding'
  | 'single-idle'
  | 'single-encoding'
  | 'single-done'
  | 'settings'
  | 'about'
  | 'crash';

interface AppState {
  activeView: AppView;
  themeId: ThemeId;
  sidebarCollapsed: boolean;
  setView: (view: AppView) => void;
  setThemeId: (id: ThemeId) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/**
 * Global app-shell store. Persistence lives in the main process (electron-store
 * via `store:*` IPC); this store holds the in-memory slice the renderer reads
 * during a session. Hydrate `themeId` and `sidebarCollapsed` on boot via
 * `useSetting(...)` in App.
 */
export const useAppStore = create<AppState>(set => ({
  activeView: 'splash',
  themeId: DEFAULT_THEME_ID,
  sidebarCollapsed: false,
  setView: activeView => set({ activeView }),
  setThemeId: themeId => set({ themeId }),
  setSidebarCollapsed: sidebarCollapsed => set({ sidebarCollapsed }),
}));
