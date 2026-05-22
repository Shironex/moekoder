import { describe, it, expect } from 'vitest';
import {
  extensionForSubtitleCodec,
  imageSubtitleHint,
  isTextSubtitleCodec,
  outputExtForFormat,
} from './subtitle-export';

describe('isTextSubtitleCodec', () => {
  it('accepts text codecs and rejects image codecs', () => {
    expect(isTextSubtitleCodec('ass')).toBe(true);
    expect(isTextSubtitleCodec('subrip')).toBe(true);
    expect(isTextSubtitleCodec('webvtt')).toBe(true);
    expect(isTextSubtitleCodec('hdmv_pgs_subtitle')).toBe(false);
    expect(isTextSubtitleCodec('dvd_subtitle')).toBe(false);
  });
});

describe('extensionForSubtitleCodec', () => {
  it('mirrors the desktop codec → extension mapping', () => {
    expect(extensionForSubtitleCodec('ass')).toBe('ass');
    expect(extensionForSubtitleCodec('ssa')).toBe('ass');
    expect(extensionForSubtitleCodec('subrip')).toBe('srt');
    expect(extensionForSubtitleCodec('webvtt')).toBe('vtt');
    expect(extensionForSubtitleCodec('hdmv_pgs_subtitle')).toBeNull();
  });
});

describe('outputExtForFormat', () => {
  it("follows the source codec for format 'source'", () => {
    expect(outputExtForFormat('ass', 'source')).toBe('ass');
    expect(outputExtForFormat('subrip', 'source')).toBe('srt');
    expect(outputExtForFormat('webvtt', 'source')).toBe('vtt');
  });

  it('forces the chosen extension regardless of source codec', () => {
    // The "I want .ass from every anime" case — SubRip still lands on .ass.
    expect(outputExtForFormat('subrip', 'ass')).toBe('ass');
    expect(outputExtForFormat('ass', 'ass')).toBe('ass');
    // And the reverse, when the user explicitly wants SRT.
    expect(outputExtForFormat('ass', 'srt')).toBe('srt');
    expect(outputExtForFormat('subrip', 'srt')).toBe('srt');
  });

  it('returns null for image (non-text) codecs', () => {
    expect(outputExtForFormat('hdmv_pgs_subtitle', 'ass')).toBeNull();
    expect(outputExtForFormat('dvd_subtitle', 'source')).toBeNull();
  });
});

describe('imageSubtitleHint', () => {
  it('returns null for text codecs and a hint for image codecs', () => {
    expect(imageSubtitleHint('ass')).toBeNull();
    expect(imageSubtitleHint('hdmv_pgs_subtitle')).toMatch(/PGS\/VOBSUB/);
  });
});
