import { contextBridge } from 'electron';
import { THEMES, DEFAULT_THEME_ID, APP_NAME, APP_SIGIL, APP_EDITION } from '@moekoder/shared';

contextBridge.exposeInMainWorld('moekoder', {
  app: { name: APP_NAME, sigil: APP_SIGIL, edition: APP_EDITION },
  themes: THEMES,
  defaultThemeId: DEFAULT_THEME_ID,
});
