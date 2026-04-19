import type { Theme } from './types';

export const plum: Theme = {
  id: 'plum',
  name: 'Plum',
  kanji: '紫',
  romaji: 'murasaki',
  mode: 'dark',
  tokens: {
    background: 'oklch(0.12 0.018 300)',
    card: 'oklch(0.16 0.025 300)',
    popover: 'oklch(0.10 0.018 300)',
    primary: 'oklch(0.74 0.15 355)',
    primaryForeground: 'oklch(0.12 0.018 300)',
    foreground: 'oklch(0.96 0.010 300)',
    mutedForeground: 'oklch(0.72 0.030 300)',
    muted: 'oklch(0.50 0.035 298)',
    border: 'oklch(1 0 0 / 0.08)',
    glow1: 'oklch(0.74 0.15 355 / 0.14)',
    glow2: 'oklch(0.50 0.15 280 / 0.18)',
    watermark: 'oklch(1 0 0 / 0.045)',
  },
};
