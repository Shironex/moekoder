import type { Theme } from './types';

export const cosmic: Theme = {
  id: 'cosmic',
  name: 'Cosmic',
  kanji: '宙',
  romaji: 'sora',
  mode: 'dark',
  tokens: {
    background: 'oklch(0.09 0.035 280)',
    card: 'oklch(0.13 0.040 280)',
    popover: 'oklch(0.07 0.035 280)',
    primary: 'oklch(0.78 0.22 290)',
    primaryForeground: 'oklch(0.07 0.035 280)',
    foreground: 'oklch(0.97 0.015 290)',
    mutedForeground: 'oklch(0.73 0.030 285)',
    muted: 'oklch(0.52 0.025 283)',
    border: 'oklch(1 0 0 / 0.07)',
    glow1: 'oklch(0.78 0.22 290 / 0.18)',
    glow2: 'oklch(0.55 0.18 270 / 0.16)',
    watermark: 'oklch(1 0 0 / 0.045)',
  },
};
