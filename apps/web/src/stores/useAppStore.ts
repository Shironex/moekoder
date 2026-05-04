import { create } from 'zustand';
import { DEFAULT_THEME_ID, type ThemeId } from '@moekoder/shared';

export type AppView =
  | 'splash'
  | 'onboarding'
  | 'single-idle'
  | 'single-encoding'
  | 'single-done'
  | 'queue'
  | 'settings'
  | 'about'
  | 'crash';

/** Top-level route. Mirrors Titlebar's tab tabs and is persisted via
 *  `queueDefaultRoute` so power-users can boot straight into the queue. */
export type AppRoute = 'single' | 'queue';

interface AppState {
  activeView: AppView;
  route: AppRoute;
  themeId: ThemeId;
  sidebarCollapsed: boolean;
  setView: (view: AppView) => void;
  setRoute: (route: AppRoute) => void;
  setThemeId: (id: ThemeId) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/**
 * Global app-shell store. Persistence lives in the main process (electron-store
 * via `store:*` IPC); this store holds the in-memory slice the renderer reads
 * during a session. Hydrate `themeId`, `sidebarCollapsed`, and
 * `queueDefaultRoute` on boot via `useSetting(...)` in App.
 */
export const useAppStore = create<AppState>(set => ({
  activeView: 'splash',
  route: 'single',
  themeId: DEFAULT_THEME_ID,
  sidebarCollapsed: false,
  setView: activeView => set({ activeView }),
  setRoute: route => set({ route }),
  setThemeId: themeId => set({ themeId }),
  setSidebarCollapsed: sidebarCollapsed => set({ sidebarCollapsed }),
}));
