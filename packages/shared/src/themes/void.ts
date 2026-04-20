import type { Theme } from './types';

// `void` is a reserved word in TS/JS, so the export uses `voidTheme` while
// the theme id (`'void'`) still follows the kanji-sigil naming convention.
export const voidTheme: Theme = {
  id: 'void',
  name: 'Void',
  kanji: '虚',
  romaji: 'kyo',
  mode: 'dark',
  tokens: {
    background: 'oklch(0.07 0.040 295)',
    card: 'oklch(0.11 0.045 295)',
    popover: 'oklch(0.05 0.040 295)',
    primary: 'oklch(0.72 0.28 295)',
    primaryForeground: 'oklch(0.05 0.040 295)',
    foreground: 'oklch(0.97 0.015 295)',
    mutedForeground: 'oklch(0.73 0.030 292)',
    muted: 'oklch(0.52 0.025 293)',
    border: 'oklch(1 0 0 / 0.07)',
    glow1: 'oklch(0.72 0.28 295 / 0.22)',
    glow2: 'oklch(0.50 0.20 280 / 0.18)',
    watermark: 'oklch(1 0 0 / 0.05)',
  },
};
