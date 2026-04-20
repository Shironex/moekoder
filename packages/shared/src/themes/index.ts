import type { Theme, ThemeId } from './types';
import { midnight } from './midnight';
import { plum } from './plum';
import { matcha } from './matcha';
import { paper } from './paper';

export const THEMES: Theme[] = [plum, midnight, matcha, paper];
export const DEFAULT_THEME_ID: ThemeId = 'plum';
export const THEMES_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t])) as Record<
  ThemeId,
  Theme
>;

export * from './types';
export { midnight, plum, matcha, paper };
