/**
 * Theme type definitions for Moekoder.
 *
 * Each theme maps 1:1 onto the CSS custom properties that live on the app
 * root (see `apps/web/src/styles/globals.css`). The desktop shell and the
 * web app both consume the same shape, so tokens are authored once here.
 */

export type ThemeId = 'midnight' | 'plum' | 'matcha' | 'paper' | 'cosmic' | 'void';

export type ThemeMode = 'dark' | 'light';

export interface ThemeTokens {
  background: string;
  card: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  foreground: string;
  mutedForeground: string;
  muted: string;
  border: string;
  glow1: string;
  glow2: string;
  watermark: string;
}

export interface Theme {
  id: ThemeId;
  /** English display name, e.g. "Midnight". */
  name: string;
  /** Single kanji used as the theme sigil, e.g. "夜". */
  kanji: string;
  /** Romaji reading of the kanji, e.g. "yoru". */
  romaji: string;
  mode: ThemeMode;
  tokens: ThemeTokens;
}
