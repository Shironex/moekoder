import type { Theme } from './types';

export const matcha: Theme = {
  id: 'matcha',
  name: 'Matcha',
  kanji: '緑',
  romaji: 'midori',
  mode: 'dark',
  tokens: {
    background: 'oklch(0.10 0.018 160)',
    card: 'oklch(0.14 0.022 160)',
    popover: 'oklch(0.08 0.018 160)',
    primary: 'oklch(0.78 0.15 140)',
    primaryForeground: 'oklch(0.08 0.018 160)',
    foreground: 'oklch(0.97 0.012 140)',
    mutedForeground: 'oklch(0.72 0.030 150)',
    muted: 'oklch(0.50 0.025 150)',
    border: 'oklch(1 0 0 / 0.07)',
    glow1: 'oklch(0.78 0.15 140 / 0.15)',
    glow2: 'oklch(0.50 0.12 160 / 0.15)',
    watermark: 'oklch(1 0 0 / 0.045)',
  },
};
