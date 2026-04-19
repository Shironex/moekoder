import { describe, it, expect } from 'vitest';
import { shouldTranscodeAudio } from './audio-fallback';

describe('shouldTranscodeAudio', () => {
  it('returns true for every lossless source + MP4 container combo', () => {
    for (const codec of ['truehd', 'dts', 'flac', 'pcm_s16le', 'pcm_s24le']) {
      expect(shouldTranscodeAudio(codec, 'mp4')).toBe(true);
    }
  });

  it('returns false for the same losslss sources when targeting MKV', () => {
    for (const codec of ['truehd', 'dts', 'flac', 'pcm_s16le', 'pcm_s24le']) {
      expect(shouldTranscodeAudio(codec, 'mkv')).toBe(false);
    }
  });

  it('returns false for lossy codecs in either container', () => {
    for (const codec of ['aac', 'ac3', 'eac3', 'mp3', 'opus', 'vorbis']) {
      expect(shouldTranscodeAudio(codec, 'mp4')).toBe(false);
      expect(shouldTranscodeAudio(codec, 'mkv')).toBe(false);
    }
  });

  it('is case-insensitive on the source codec name', () => {
    expect(shouldTranscodeAudio('TRUEHD', 'mp4')).toBe(true);
    expect(shouldTranscodeAudio('FLAC', 'mp4')).toBe(true);
    expect(shouldTranscodeAudio('DTS', 'mp4')).toBe(true);
  });

  it('returns false when the source codec is undefined', () => {
    expect(shouldTranscodeAudio(undefined, 'mp4')).toBe(false);
    expect(shouldTranscodeAudio(undefined, 'mkv')).toBe(false);
  });

  it('returns false for an empty-string codec', () => {
    expect(shouldTranscodeAudio('', 'mp4')).toBe(false);
  });

  it('does not match partial substrings (e.g. `dts-hd` is not `dts`)', () => {
    // `dts-hd` is a common ffprobe variant — we only match the canonical set.
    expect(shouldTranscodeAudio('dts-hd', 'mp4')).toBe(false);
  });
});
