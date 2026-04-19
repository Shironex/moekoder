import type { Theme } from './types';

export const midnight: Theme = {
  id: 'midnight',
  name: 'Midnight',
  kanji: '夜',
  romaji: 'yoru',
  mode: 'dark',
  tokens: {
    background: 'oklch(0.09 0.030 250)',
    card: 'oklch(0.13 0.035 250)',
    popover: 'oklch(0.07 0.030 250)',
    primary: 'oklch(0.70 0.20 220)',
    primaryForeground: 'oklch(0.07 0.030 250)',
    foreground: 'oklch(0.97 0.015 220)',
    mutedForeground: 'oklch(0.72 0.030 235)',
    muted: 'oklch(0.50 0.025 240)',
    border: 'oklch(1 0 0 / 0.07)',
    glow1: 'oklch(0.70 0.20 220 / 0.16)',
    glow2: 'oklch(0.50 0.15 260 / 0.18)',
    watermark: 'oklch(1 0 0 / 0.045)',
  },
};
