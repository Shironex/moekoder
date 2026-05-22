import { describe, it, expect } from 'vitest';
import { deriveSubtitleLang } from './subtitle-lang';

describe('deriveSubtitleLang', () => {
  it('maps a 2-letter (639-1) suffix up to 639-2/B', () => {
    expect(deriveSubtitleLang('Episode 01.en.ass')).toBe('eng');
    expect(deriveSubtitleLang('Episode 01.pl.ass')).toBe('pol');
    expect(deriveSubtitleLang('Episode 01.ja.ass')).toBe('jpn');
  });

  it('accepts an already-3-letter (639-2) suffix verbatim', () => {
    expect(deriveSubtitleLang('Episode 01.eng.ass')).toBe('eng');
    expect(deriveSubtitleLang('Episode 01.pol.srt')).toBe('pol');
  });

  it('returns null when there is no language segment', () => {
    expect(deriveSubtitleLang('Episode 01.ass')).toBeNull();
    expect(deriveSubtitleLang('subtitle.srt')).toBeNull();
  });

  it('returns null for an unrecognised 2-letter code', () => {
    expect(deriveSubtitleLang('Episode 01.xx.ass')).toBeNull();
  });

  it('returns null for a non-alphabetic 3-letter segment', () => {
    expect(deriveSubtitleLang('Episode 01.123.ass')).toBeNull();
  });

  it('strips the directory before inspecting the filename', () => {
    expect(deriveSubtitleLang('C:\\anime\\Show\\Ep 01.pl.ass')).toBe('pol');
    expect(deriveSubtitleLang('/anime/show/ep 01.fr.ass')).toBe('fre');
  });

  it('is case-insensitive on the language segment', () => {
    expect(deriveSubtitleLang('Episode 01.EN.ass')).toBe('eng');
    expect(deriveSubtitleLang('Episode 01.Pol.ass')).toBe('pol');
  });
});
