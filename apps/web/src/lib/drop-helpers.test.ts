import { describe, it, expect } from 'vitest';
import { autoPairFiles, categorizePaths, getFileName } from './drop-helpers';

describe('drop-helpers', () => {
  describe('categorizePaths', () => {
    it('routes paths to videos / subtitles / other by extension', () => {
      const result = categorizePaths([
        'C:\\anime\\ep01.mkv',
        '/anime/ep01.ass',
        '/anime/ep02.mp4',
        '/anime/ep02.srt',
        '/anime/notes.txt',
      ]);
      expect(result.videos).toEqual(['C:\\anime\\ep01.mkv', '/anime/ep02.mp4']);
      expect(result.subtitles).toEqual(['/anime/ep01.ass', '/anime/ep02.srt']);
      expect(result.other).toEqual(['/anime/notes.txt']);
    });

    it('skips empty strings', () => {
      const result = categorizePaths(['', '/anime/ep01.mkv', '']);
      expect(result.videos).toEqual(['/anime/ep01.mkv']);
      expect(result.subtitles).toEqual([]);
      expect(result.other).toEqual([]);
    });

    it('handles all extended extensions', () => {
      const result = categorizePaths([
        '/v.mkv',
        '/v.mp4',
        '/v.m4v',
        '/v.webm',
        '/v.avi',
        '/v.mov',
        '/v.ts',
        '/v.m2ts',
        '/s.ass',
        '/s.ssa',
        '/s.srt',
        '/s.vtt',
      ]);
      expect(result.videos).toHaveLength(8);
      expect(result.subtitles).toHaveLength(4);
      expect(result.other).toHaveLength(0);
    });
  });

  describe('getFileName', () => {
    it('should extract filename from Windows path', () => {
      expect(getFileName('C:\\Users\\test\\video.mkv')).toBe('video.mkv');
    });

    it('should extract filename from Unix path', () => {
      expect(getFileName('/home/test/video.mkv')).toBe('video.mkv');
    });

    it('should return the input if no path separator', () => {
      expect(getFileName('video.mkv')).toBe('video.mkv');
    });
  });

  describe('autoPairFiles', () => {
    it('should pair videos with exact matching subtitles', () => {
      const videos = ['/path/video1.mkv', '/path/video2.mkv'];
      const subtitles = ['/path/video1.ass', '/path/video2.ass'];

      const result = autoPairFiles(videos, subtitles);

      expect(result.paired).toHaveLength(2);
      expect(result.unpaired).toHaveLength(0);
      expect(result.paired[0]).toEqual({
        video: '/path/video1.mkv',
        subtitle: '/path/video1.ass',
      });
    });

    it('should handle unpaired videos', () => {
      const videos = ['/path/video1.mkv', '/path/video2.mkv'];
      const subtitles = ['/path/video1.ass'];

      const result = autoPairFiles(videos, subtitles);

      expect(result.paired).toHaveLength(1);
      expect(result.unpaired).toHaveLength(1);
      expect(result.unpaired[0]).toBe('/path/video2.mkv');
    });

    it('should match when video name contains subtitle name', () => {
      const videos = ['/path/video_1080p.mkv'];
      const subtitles = ['/path/video.ass'];

      const result = autoPairFiles(videos, subtitles);

      expect(result.paired).toHaveLength(1);
      expect(result.paired[0].video).toBe('/path/video_1080p.mkv');
      expect(result.paired[0].subtitle).toBe('/path/video.ass');
    });

    it('should match when subtitle name contains video name', () => {
      const videos = ['/path/video.mkv'];
      const subtitles = ['/path/video_eng.ass'];

      const result = autoPairFiles(videos, subtitles);

      expect(result.paired).toHaveLength(1);
      expect(result.paired[0].video).toBe('/path/video.mkv');
      expect(result.paired[0].subtitle).toBe('/path/video_eng.ass');
    });

    it('should not reuse subtitles for multiple videos', () => {
      const videos = ['/path/video1.mkv', '/path/video2.mkv'];
      const subtitles = ['/path/video1.ass'];

      const result = autoPairFiles(videos, subtitles);

      expect(result.paired).toHaveLength(1);
      expect(result.unpaired).toHaveLength(1);
    });

    it('should handle empty arrays', () => {
      const result = autoPairFiles([], []);

      expect(result.paired).toHaveLength(0);
      expect(result.unpaired).toHaveLength(0);
    });

    it('should handle case-insensitive matching', () => {
      const videos = ['/path/VIDEO.mkv'];
      const subtitles = ['/path/video.ass'];

      const result = autoPairFiles(videos, subtitles);

      expect(result.paired).toHaveLength(1);
    });
  });
});
