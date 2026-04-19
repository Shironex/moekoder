import { describe, it, expect } from 'vitest';
import {
  categorizeLog,
  extractDuration,
  filterLogLines,
  formatETA,
  parseProgressLine,
  parseProgressPipe,
  parseTime,
} from './output-parser';

describe('parseTime', () => {
  it('parses HH:MM:SS.cs', () => {
    expect(parseTime('01:30:45.50')).toBeCloseTo(5445.5, 4);
  });

  it('parses MM:SS.cs', () => {
    expect(parseTime('05:30.25')).toBeCloseTo(330.25, 4);
  });

  it('parses a bare seconds float', () => {
    expect(parseTime('90.5')).toBeCloseTo(90.5, 4);
  });
});

describe('extractDuration', () => {
  it('extracts duration from a canned stderr Input block', () => {
    const blob = `
Input #0, matroska,webm, from 'episode.mkv':
  Metadata:
    title           : Episode 01
  Duration: 00:24:13.75, start: 0.000000, bitrate: 4321 kb/s
  Stream #0:0: Video: h264 ...
`;
    expect(extractDuration(blob)).toBeCloseTo(24 * 60 + 13.75, 3);
  });

  it('returns null when no Duration line is present', () => {
    expect(extractDuration('ffmpeg version N-xxxxx-g...\n')).toBeNull();
  });
});

describe('formatETA', () => {
  it('formats seconds only', () => {
    expect(formatETA(42)).toBe('42s');
  });

  it('formats minutes + seconds', () => {
    expect(formatETA(125)).toBe('2m 5s');
  });

  it('formats hours + minutes + seconds', () => {
    expect(formatETA(3 * 3600 + 17 * 60 + 9)).toBe('3h 17m 9s');
  });

  it('returns placeholder for negative / non-finite', () => {
    expect(formatETA(-1)).toBe('Calculating...');
    expect(formatETA(Number.POSITIVE_INFINITY)).toBe('Calculating...');
    expect(formatETA(Number.NaN)).toBe('Calculating...');
  });
});

describe('parseProgressLine (legacy stderr)', () => {
  it('parses a full progress line with bitrate + speed', () => {
    const line =
      'frame=  123 fps=45 q=28.0 size=1024kB time=00:00:05.12 bitrate=1634.2kbits/s speed=1.5x';
    const p = parseProgressLine(line, 120, Date.now() - 5000);
    expect(p).not.toBeNull();
    expect(p!.frame).toBe(123);
    expect(p!.fps).toBe(45);
    expect(p!.time).toBe('00:00:05.12');
    expect(p!.bitrate).toBe('1634.2kbits/s');
    expect(p!.speed).toBe('1.5x');
    // 5.12 / 120 = ~4.27%
    expect(p!.percentage).toBeCloseTo(4.27, 1);
    expect(p!.eta).not.toBeNull();
  });

  it('returns null when the line is not a progress line', () => {
    expect(parseProgressLine('Press [q] to stop, [?] for help', 120, Date.now())).toBeNull();
  });

  it('falls back to N/A for missing fields', () => {
    // `frame=` present but no bitrate / speed — still a valid progress line.
    const line = 'frame=10 time=00:00:01.00';
    const p = parseProgressLine(line, 60, Date.now());
    expect(p).not.toBeNull();
    expect(p!.bitrate).toBe('N/A');
    expect(p!.speed).toBe('N/A');
  });

  it('clamps percentage at 100 when current time exceeds duration', () => {
    const line = 'frame=9999 fps=60 time=00:02:30.00';
    const p = parseProgressLine(line, 60, Date.now());
    expect(p!.percentage).toBe(100);
  });
});

describe('parseProgressPipe', () => {
  it('parses `out_time_us` as microseconds', () => {
    expect(parseProgressPipe('out_time_us=12345678')).toEqual({ outTimeUs: 12_345_678 });
  });

  it('parses `out_time` HH:MM:SS.cs into microseconds', () => {
    expect(parseProgressPipe('out_time=00:00:01.50')).toEqual({
      outTimeUs: 1_500_000,
    });
  });

  it('parses `frame` as integer', () => {
    expect(parseProgressPipe('frame=250')).toEqual({ frame: 250 });
  });

  it('parses `fps` as float', () => {
    expect(parseProgressPipe('fps=59.94')).toEqual({ fps: 59.94 });
  });

  it('parses `bitrate=1234.5kbits/s` into kbps', () => {
    expect(parseProgressPipe('bitrate=1234.5kbits/s')).toEqual({ bitrateKbps: 1234.5 });
  });

  it('parses `bitrate=2.5mbits/s` into kbps', () => {
    expect(parseProgressPipe('bitrate=2.5mbits/s')).toEqual({ bitrateKbps: 2500 });
  });

  it('parses `speed=1.23x`', () => {
    expect(parseProgressPipe('speed=1.23x')).toEqual({ speed: 1.23 });
  });

  it('parses `total_size` bytes', () => {
    expect(parseProgressPipe('total_size=1048576')).toEqual({ sizeBytes: 1_048_576 });
  });

  it('parses the `progress=continue` sentinel', () => {
    expect(parseProgressPipe('progress=continue')).toEqual({ progress: 'continue' });
  });

  it('parses the `progress=end` sentinel', () => {
    expect(parseProgressPipe('progress=end')).toEqual({ progress: 'end' });
  });

  it('ignores `N/A` values', () => {
    expect(parseProgressPipe('bitrate=N/A')).toBeNull();
    expect(parseProgressPipe('speed=N/A')).toBeNull();
  });

  it('ignores unknown keys', () => {
    expect(parseProgressPipe('drop_frames=0')).toBeNull();
  });

  it('ignores blank lines', () => {
    expect(parseProgressPipe('')).toBeNull();
    expect(parseProgressPipe('   ')).toBeNull();
  });
});

describe('categorizeLog', () => {
  it('classifies errors on `error` / `failed` / `invalid`', () => {
    expect(categorizeLog('Error while decoding stream')).toBe('error');
    expect(categorizeLog('Operation failed')).toBe('error');
    expect(categorizeLog('Invalid data found')).toBe('error');
  });

  it('classifies warnings but ignores the libass "glyph not found" noise', () => {
    expect(categorizeLog('Warning: deprecated option')).toBe('warning');
    expect(categorizeLog('glyph not found: U+00FF')).not.toBe('warning');
  });

  it('classifies success on `completed` / `success` / `done`', () => {
    expect(categorizeLog('Process completed successfully')).toBe('success');
  });

  it('classifies metadata on stream / duration / bitrate / encoder', () => {
    expect(categorizeLog('Stream #0:0: Video: h264')).toBe('metadata');
    expect(categorizeLog('Duration: 00:24:13.75')).toBe('metadata');
  });

  it('classifies debug on libav / configuration:', () => {
    expect(categorizeLog('libavcodec 60.31.102')).toBe('debug');
  });

  it('defaults to info for unclassified lines', () => {
    expect(categorizeLog('Press [q] to stop')).toBe('info');
  });
});

describe('filterLogLines', () => {
  it('drops noisy size= / frame= progress lines', () => {
    const blob = `
Input #0, matroska,webm, from 'a.mkv':
frame=  10 fps=60 size=1024kB
  Duration: 00:00:10.00
frame=  20 fps=60 size=2048kB
[libx264 @ 0x1] frame I:1 Avg QP:20.00
`;
    const lines = filterLogLines(blob);
    expect(lines).toEqual([
      "Input #0, matroska,webm, from 'a.mkv':",
      'Duration: 00:00:10.00',
      '[libx264 @ 0x1] frame I:1 Avg QP:20.00',
    ]);
  });

  it('returns an empty array for an all-noise blob', () => {
    expect(filterLogLines('frame=1 size=1kB\nframe=2 size=2kB\n')).toEqual([]);
  });
});
