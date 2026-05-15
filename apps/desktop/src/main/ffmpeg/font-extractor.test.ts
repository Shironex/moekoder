import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  cleanupFontsDir,
  diagnoseMissingFonts,
  extractFonts,
  filterFontAttachments,
  findReferencedFonts,
  type FontExtractorFs,
  type SpawnFn,
} from './font-extractor';
import type { LogLine } from './processor';
import type { ProbeAttachment } from './probe';

/**
 * Build a stub `ChildProcess`-shaped EventEmitter that fires `close` on
 * the next tick. The extractor only reads `stderr.on('data')` + the
 * lifecycle events, so the minimal shape suffices.
 */
const makeChildStub = (
  exitCode: number,
  stderrChunks: string[] = []
): EventEmitter & { stderr: EventEmitter } => {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  child.stderr = new EventEmitter();
  // Fire stderr first, then `close`, on a microtask boundary so the
  // listener registration in `extractFonts` completes first.
  queueMicrotask(() => {
    for (const chunk of stderrChunks) child.stderr.emit('data', Buffer.from(chunk));
    child.emit('close', exitCode);
  });
  return child;
};

const makeFsStub = (
  files: string[],
  tempDir = '/tmp/mkfont-test'
): FontExtractorFs & { __removed: string[] } => {
  const removed: string[] = [];
  return {
    __removed: removed,
    mkdtemp: vi.fn(async () => tempDir),
    readdir: vi.fn(async (dir: string) => {
      if (dir !== tempDir) return [];
      return files;
    }),
    rm: vi.fn(async (dir: string) => {
      removed.push(dir);
    }),
  };
};

const FONT_ATTACHMENT: ProbeAttachment = {
  index: 1,
  filename: 'Bauhaus 93.ttf',
  mimeType: 'application/x-truetype-font',
};

const COVER_ART_ATTACHMENT: ProbeAttachment = {
  index: 2,
  filename: 'cover.jpg',
  mimeType: 'image/jpeg',
};

describe('filterFontAttachments', () => {
  it('keeps font-extension attachments', () => {
    expect(
      filterFontAttachments([
        { index: 0, filename: 'a.ttf' },
        { index: 1, filename: 'b.OTF' },
        { index: 2, filename: 'c.ttc' },
        { index: 3, filename: 'd.woff2' },
      ])
    ).toHaveLength(4);
  });

  it('drops non-font extensions even when mime is empty', () => {
    expect(
      filterFontAttachments([
        { index: 0, filename: 'cover.jpg' },
        { index: 1, filename: 'notes.nfo' },
      ])
    ).toEqual([]);
  });

  it('keeps an attachment with unknown extension but font mime hint', () => {
    expect(
      filterFontAttachments([{ index: 0, filename: 'mystery.bin', mimeType: 'application/x-font' }])
    ).toHaveLength(1);
  });

  it('drops cover art with image/* mime even when extension is missing', () => {
    expect(filterFontAttachments([COVER_ART_ATTACHMENT])).toEqual([]);
  });
});

describe('extractFonts', () => {
  it('returns null when no font-shaped attachments are present', async () => {
    const result = await extractFonts({
      videoPath: '/in/video.mkv',
      attachments: [COVER_ART_ATTACHMENT],
      jobId: 'job-1',
      ffmpegPath: '/bin/ffmpeg',
      spawn: vi.fn() as SpawnFn,
      fsImpl: makeFsStub([]),
    });
    expect(result).toBeNull();
  });

  it('spawns ffmpeg with cwd=tempDir and a `-dump_attachment` arg', async () => {
    const spawn = vi.fn(
      (_cmd: string, _args: string[], _opts: { cwd: string; windowsHide?: boolean }) =>
        makeChildStub(1, ['Output #0 not found\n']) as unknown as ChildProcess
    );
    const fsImpl = makeFsStub(['Bauhaus 93.ttf']);

    const result = await extractFonts({
      videoPath: '/in/video.mkv',
      attachments: [FONT_ATTACHMENT],
      jobId: 'job-spawn',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SpawnFn,
      fsImpl,
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawn.mock.calls[0]!;
    expect(cmd).toBe('/bin/ffmpeg');
    expect(args).toEqual(['-y', '-dump_attachment:t', '', '-i', '/in/video.mkv']);
    expect(opts.cwd).toBe('/tmp/mkfont-test');
    expect(opts.windowsHide).toBe(true);
    expect(result).toEqual({ dir: '/tmp/mkfont-test', fontFiles: ['Bauhaus 93.ttf'] });
  });

  it('treats ffmpeg exit code 1 as success when at least one font landed', async () => {
    // The big gotcha — `-dump_attachment:t ""` exits 1 even on a perfectly
    // good dump because it complains about the missing output file.
    const spawn = vi.fn(
      () =>
        makeChildStub(1, [
          'At least one output file must be specified\n',
        ]) as unknown as ChildProcess
    );
    const fsImpl = makeFsStub(['NotoSerif.otf', 'Bauhaus.ttf']);

    const result = await extractFonts({
      videoPath: '/in/v.mkv',
      attachments: [FONT_ATTACHMENT],
      jobId: 'job-exit1',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SpawnFn,
      fsImpl,
    });

    expect(result?.fontFiles).toEqual(['NotoSerif.otf', 'Bauhaus.ttf']);
  });

  it('rejects on a real failure (non-0/1 exit code)', async () => {
    const spawn = vi.fn(
      () => makeChildStub(2, ['fatal: invalid input\n']) as unknown as ChildProcess
    );
    const fsImpl = makeFsStub([]);

    await expect(
      extractFonts({
        videoPath: '/in/v.mkv',
        attachments: [FONT_ATTACHMENT],
        jobId: 'job-fail',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SpawnFn,
        fsImpl,
      })
    ).rejects.toThrow(/exited with code 2/);
  });

  it('throws and cleans up when exit 1 produces no font files', async () => {
    // Hostile input — ffmpeg exits with the usual code 1 but no actual
    // attachment files made it to disk. We must NOT return a fontsDir
    // that libass would scan as empty (it'd still work, but pointless),
    // and we must remove the empty temp dir.
    const spawn = vi.fn(() => makeChildStub(1) as unknown as ChildProcess);
    const fsImpl = makeFsStub([]);

    await expect(
      extractFonts({
        videoPath: '/in/v.mkv',
        attachments: [FONT_ATTACHMENT],
        jobId: 'job-empty',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SpawnFn,
        fsImpl,
      })
    ).rejects.toThrow(/produced no font files/);

    expect(fsImpl.__removed).toEqual(['/tmp/mkfont-test']);
  });

  it('emits an info log on success with the font count + temp dir', async () => {
    const spawn = vi.fn(() => makeChildStub(1) as unknown as ChildProcess);
    const fsImpl = makeFsStub(['a.ttf', 'b.otf']);
    const logs: LogLine[] = [];

    await extractFonts({
      videoPath: '/in/v.mkv',
      attachments: [FONT_ATTACHMENT],
      jobId: 'job-log',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SpawnFn,
      fsImpl,
      onLog: l => logs.push(l),
      now: () => 1700000000000,
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      ts: 1700000000000,
      level: 'info',
      text: 'Extracted 2 fonts from MKV attachments → /tmp/mkfont-test',
    });
  });

  it('filters readdir output to font extensions only', async () => {
    // ffmpeg dumps every attachment regardless of our filter; we narrow
    // the kept list at the dir level so cover art doesn't show up in
    // `fontFiles` even if the user's MKV ships some.
    const spawn = vi.fn(() => makeChildStub(1) as unknown as ChildProcess);
    const fsImpl = makeFsStub(['Bauhaus.ttf', 'cover.jpg', 'notes.nfo', 'NotoSerif.otf']);

    const result = await extractFonts({
      videoPath: '/in/v.mkv',
      attachments: [FONT_ATTACHMENT, COVER_ART_ATTACHMENT],
      jobId: 'job-filter',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SpawnFn,
      fsImpl,
    });

    expect(result?.fontFiles).toEqual(['Bauhaus.ttf', 'NotoSerif.otf']);
  });
});

describe('cleanupFontsDir', () => {
  it('removes the dir recursively + forcefully', async () => {
    const fsImpl = makeFsStub([]);
    await cleanupFontsDir('/tmp/mkfont-x', fsImpl);
    expect(fsImpl.rm).toHaveBeenCalledWith('/tmp/mkfont-x', { recursive: true, force: true });
  });

  it('swallows ENOENT (cleanup races are not failures)', async () => {
    const fsImpl: FontExtractorFs = {
      mkdtemp: vi.fn(),
      readdir: vi.fn(),
      rm: vi.fn(async () => {
        const err = new Error('not found') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }),
    };
    await expect(cleanupFontsDir('/gone', fsImpl)).resolves.toBeUndefined();
  });

  it('re-throws non-ENOENT errors', async () => {
    const fsImpl: FontExtractorFs = {
      mkdtemp: vi.fn(),
      readdir: vi.fn(),
      rm: vi.fn(async () => {
        throw new Error('EACCES: permission denied');
      }),
    };
    await expect(cleanupFontsDir('/x', fsImpl)).rejects.toThrow(/EACCES/);
  });
});

describe('findReferencedFonts', () => {
  it('returns an empty list when the subtitle has no \\fn overrides', () => {
    expect(findReferencedFonts('Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello')).toEqual(
      []
    );
  });

  it('extracts a single \\fn(...) reference', () => {
    const ass = 'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\fn(Bauhaus 93)}Hello';
    expect(findReferencedFonts(ass)).toEqual(['Bauhaus 93']);
  });

  it('deduplicates references across the file', () => {
    const ass = `
      {\\fn(Comic Sans MS)}line one
      {\\fn(Comic Sans MS)}line two
      {\\fn(Noto Serif JP)}line three
    `;
    expect(findReferencedFonts(ass)).toEqual(['Comic Sans MS', 'Noto Serif JP']);
  });

  it('handles whitespace and case in the override syntax', () => {
    const ass = '{\\fn( Bauhaus 93 )}{\\fn(  NotoSerif  )}';
    expect(findReferencedFonts(ass)).toEqual(['Bauhaus 93', 'NotoSerif']);
  });
});

describe('diagnoseMissingFonts', () => {
  it('warns for each referenced font not found among the extracted set', () => {
    const logs: LogLine[] = [];
    const missing = diagnoseMissingFonts({
      referenced: ['Bauhaus 93', 'Comic Sans MS'],
      extractedFonts: ['Bauhaus 93.ttf'],
      onLog: l => logs.push(l),
      now: () => 1,
    });
    expect(missing).toEqual(['Comic Sans MS']);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe('warn');
    expect(logs[0]?.text).toContain('Comic Sans MS');
  });

  it('matches case-insensitively and tolerates the .otf extension', () => {
    const missing = diagnoseMissingFonts({
      referenced: ['NotoSerif'],
      extractedFonts: ['notoserif.otf'],
    });
    expect(missing).toEqual([]);
  });

  it('returns an empty list when every reference is present', () => {
    const missing = diagnoseMissingFonts({
      referenced: ['Bauhaus 93'],
      extractedFonts: ['Bauhaus 93.ttf'],
    });
    expect(missing).toEqual([]);
  });
});
