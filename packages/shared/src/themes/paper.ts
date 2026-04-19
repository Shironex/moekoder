import type { Theme } from './types';

export const paper: Theme = {
  id: 'paper',
  name: 'Paper',
  kanji: '紙',
  romaji: 'kami',
  mode: 'light',
  tokens: {
    background: 'oklch(0.97 0.008 80)',
    card: 'oklch(0.92 0.010 340)',
    popover: 'oklch(0.94 0.010 80)',
    primary: 'oklch(0.56 0.20 355)',
    primaryForeground: 'oklch(0.97 0.008 80)',
    foreground: 'oklch(0.18 0.020 320)',
    mutedForeground: 'oklch(0.38 0.020 320)',
    muted: 'oklch(0.52 0.020 320)',
    border: 'oklch(0 0 0 / 0.09)',
    glow1: 'oklch(0.56 0.20 355 / 0.08)',
    glow2: 'oklch(0.50 0.12 300 / 0.06)',
    watermark: 'oklch(0 0 0 / 0.05)',
  },
};
