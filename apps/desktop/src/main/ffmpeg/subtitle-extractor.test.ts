import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { buildExtractArgs, extractSubtitle, type SubtitleSpawnFn } from './subtitle-extractor';
import {
  extensionForSubtitleCodec,
  isTextSubtitleCodec,
  resolveSubtitleOutput,
  subtitleCodecForExtension,
} from './subtitle-codecs';
import type { LogLine } from './processor';

/**
 * Minimal `ChildProcess`-shaped EventEmitter that fires `close` on the next
 * tick. The extractor only reads `stderr.on('data')` + the lifecycle events.
 */
const makeChildStub = (
  exitCode: number | null,
  stderrChunks: string[] = []
): EventEmitter & { stderr: EventEmitter } => {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    for (const chunk of stderrChunks) child.stderr.emit('data', Buffer.from(chunk));
    child.emit('close', exitCode);
  });
  return child;
};

const VIDEO = 'C:\\in\\ep01.mkv';

describe('subtitle-codecs', () => {
  describe('extensionForSubtitleCodec', () => {
    it('maps ass + ssa to .ass', () => {
      expect(extensionForSubtitleCodec('ass')).toBe('ass');
      expect(extensionForSubtitleCodec('ssa')).toBe('ass');
    });

    it('maps subrip/srt to .srt and webvtt to .vtt', () => {
      expect(extensionForSubtitleCodec('subrip')).toBe('srt');
      expect(extensionForSubtitleCodec('srt')).toBe('srt');
      expect(extensionForSubtitleCodec('webvtt')).toBe('vtt');
    });

    it('returns null for image subtitle codecs', () => {
      expect(extensionForSubtitleCodec('hdmv_pgs_subtitle')).toBeNull();
      expect(extensionForSubtitleCodec('dvd_subtitle')).toBeNull();
    });
  });

  describe('isTextSubtitleCodec', () => {
    it('accepts text codecs and rejects image codecs', () => {
      expect(isTextSubtitleCodec('ass')).toBe(true);
      expect(isTextSubtitleCodec('subrip')).toBe(true);
      expect(isTextSubtitleCodec('webvtt')).toBe(true);
      expect(isTextSubtitleCodec('hdmv_pgs_subtitle')).toBe(false);
      expect(isTextSubtitleCodec('dvd_subtitle')).toBe(false);
    });
  });

  describe('subtitleCodecForExtension', () => {
    it('maps file extensions to ffmpeg `-c:s` tokens', () => {
      expect(subtitleCodecForExtension('ass')).toBe('ass');
      expect(subtitleCodecForExtension('.SSA')).toBe('ass');
      expect(subtitleCodecForExtension('srt')).toBe('srt');
      expect(subtitleCodecForExtension('vtt')).toBe('webvtt');
      expect(subtitleCodecForExtension('sub')).toBeNull();
    });
  });

  describe('resolveSubtitleOutput', () => {
    it("copies verbatim for format 'source', extension following the codec", () => {
      expect(resolveSubtitleOutput('ass', 'source')).toEqual({ codecArg: 'copy', ext: 'ass' });
      expect(resolveSubtitleOutput('subrip', 'source')).toEqual({ codecArg: 'copy', ext: 'srt' });
    });

    it('copies when the forced format already matches the source', () => {
      expect(resolveSubtitleOutput('ass', 'ass')).toEqual({ codecArg: 'copy', ext: 'ass' });
      expect(resolveSubtitleOutput('ssa', 'ass')).toEqual({ codecArg: 'copy', ext: 'ass' });
      expect(resolveSubtitleOutput('subrip', 'srt')).toEqual({ codecArg: 'copy', ext: 'srt' });
    });

    it('transcodes when the forced format differs from the source', () => {
      // SubRip → ASS (the "I want .ass from every anime" case).
      expect(resolveSubtitleOutput('subrip', 'ass')).toEqual({ codecArg: 'ass', ext: 'ass' });
      // ASS → SRT (lossy, but explicit user choice).
      expect(resolveSubtitleOutput('ass', 'srt')).toEqual({ codecArg: 'srt', ext: 'srt' });
      // WebVTT → ASS.
      expect(resolveSubtitleOutput('webvtt', 'ass')).toEqual({ codecArg: 'ass', ext: 'ass' });
    });

    it('returns null for image (non-text) codecs', () => {
      expect(resolveSubtitleOutput('hdmv_pgs_subtitle', 'ass')).toBeNull();
      expect(resolveSubtitleOutput('dvd_subtitle', 'source')).toBeNull();
    });
  });
});

describe('buildExtractArgs', () => {
  it('maps the subtitle ordinal via `0:s:<N>`, defaulting to a copy codec', () => {
    expect(
      buildExtractArgs({ videoPath: VIDEO, streamIndex: 1, outputPath: 'C:\\out\\ep01.ass' })
    ).toEqual(['-i', VIDEO, '-map', '0:s:1', '-c:s', 'copy', '-y', 'C:\\out\\ep01.ass']);
  });

  it('emits the given `-c:s` token when transcoding', () => {
    expect(
      buildExtractArgs({
        videoPath: VIDEO,
        streamIndex: 0,
        outputPath: 'C:\\out\\ep01.ass',
        codecArg: 'ass',
      })
    ).toEqual(['-i', VIDEO, '-map', '0:s:0', '-c:s', 'ass', '-y', 'C:\\out\\ep01.ass']);
  });
});

describe('extractSubtitle', () => {
  it('spawns ffmpeg with the expected args and resolves on exit 0', async () => {
    const spawn = vi.fn(
      (_cmd: string, _args: string[], _opts: { windowsHide?: boolean }) =>
        makeChildStub(0) as unknown as ChildProcess
    );

    const result = await extractSubtitle({
      videoPath: VIDEO,
      streamIndex: 0,
      codec: 'ass',
      outputPath: 'C:\\out\\ep01.ass',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SubtitleSpawnFn,
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawn.mock.calls[0]!;
    expect(cmd).toBe('/bin/ffmpeg');
    expect(args).toEqual(['-i', VIDEO, '-map', '0:s:0', '-c:s', 'copy', '-y', 'C:\\out\\ep01.ass']);
    expect(opts.windowsHide).toBe(true);
    expect(result).toEqual({ outputPath: 'C:\\out\\ep01.ass', streamIndex: 0 });
  });

  it('passes raw paths to spawn (no libass escaping)', async () => {
    const spawn = vi.fn(
      (_cmd: string, _args: string[], _opts: { windowsHide?: boolean }) =>
        makeChildStub(0) as unknown as ChildProcess
    );
    await extractSubtitle({
      videoPath: VIDEO,
      streamIndex: 2,
      codec: 'subrip',
      outputPath: 'C:\\out\\ep01.srt',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SubtitleSpawnFn,
    });
    const [, args] = spawn.mock.calls[0]!;
    expect(args).toContain(VIDEO);
    expect(args).toContain('C:\\out\\ep01.srt');
  });

  it('rejects an image subtitle codec before spawning', async () => {
    const spawn = vi.fn();
    await expect(
      extractSubtitle({
        videoPath: VIDEO,
        streamIndex: 0,
        codec: 'hdmv_pgs_subtitle',
        outputPath: 'C:\\out\\ep01.ass',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SubtitleSpawnFn,
      })
    ).rejects.toThrow(/not a text subtitle/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects an output extension that mismatches the resolved format', async () => {
    const spawn = vi.fn();
    // codec ass + default format 'source' resolves to a `.ass` extension, so a
    // `.srt` output path is a mismatch.
    await expect(
      extractSubtitle({
        videoPath: VIDEO,
        streamIndex: 0,
        codec: 'ass',
        outputPath: 'C:\\out\\ep01.srt',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SubtitleSpawnFn,
      })
    ).rejects.toThrow(/does not match/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("transcodes a SubRip source to .ass when format is 'ass'", async () => {
    const spawn = vi.fn(
      (_cmd: string, _args: string[], _opts: { windowsHide?: boolean }) =>
        makeChildStub(0) as unknown as ChildProcess
    );
    const result = await extractSubtitle({
      videoPath: VIDEO,
      streamIndex: 0,
      codec: 'subrip',
      format: 'ass',
      outputPath: 'C:\\out\\ep01.ass',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SubtitleSpawnFn,
    });
    const [, args] = spawn.mock.calls[0]!;
    expect(args).toEqual(['-i', VIDEO, '-map', '0:s:0', '-c:s', 'ass', '-y', 'C:\\out\\ep01.ass']);
    expect(result).toEqual({ outputPath: 'C:\\out\\ep01.ass', streamIndex: 0 });
  });

  it("transcodes an ASS source to .srt when format is 'srt'", async () => {
    const spawn = vi.fn(
      (_cmd: string, _args: string[], _opts: { windowsHide?: boolean }) =>
        makeChildStub(0) as unknown as ChildProcess
    );
    await extractSubtitle({
      videoPath: VIDEO,
      streamIndex: 1,
      codec: 'ass',
      format: 'srt',
      outputPath: 'C:\\out\\ep01.srt',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SubtitleSpawnFn,
    });
    const [, args] = spawn.mock.calls[0]!;
    expect(args).toEqual(['-i', VIDEO, '-map', '0:s:1', '-c:s', 'srt', '-y', 'C:\\out\\ep01.srt']);
  });

  it('copies (no transcode) when forced format already matches the source', async () => {
    const spawn = vi.fn(
      (_cmd: string, _args: string[], _opts: { windowsHide?: boolean }) =>
        makeChildStub(0) as unknown as ChildProcess
    );
    await extractSubtitle({
      videoPath: VIDEO,
      streamIndex: 0,
      codec: 'ass',
      format: 'ass',
      outputPath: 'C:\\out\\ep01.ass',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SubtitleSpawnFn,
    });
    const [, args] = spawn.mock.calls[0]!;
    expect(args).toContain('-c:s');
    expect(args[args.indexOf('-c:s') + 1]).toBe('copy');
  });

  it('rejects when the output extension mismatches a forced format', async () => {
    const spawn = vi.fn();
    // format 'ass' resolves to a `.ass` extension; a `.srt` path is a mismatch.
    await expect(
      extractSubtitle({
        videoPath: VIDEO,
        streamIndex: 0,
        codec: 'subrip',
        format: 'ass',
        outputPath: 'C:\\out\\ep01.srt',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SubtitleSpawnFn,
      })
    ).rejects.toThrow(/does not match/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects a negative or non-integer stream index', async () => {
    const spawn = vi.fn();
    await expect(
      extractSubtitle({
        videoPath: VIDEO,
        streamIndex: -1,
        codec: 'ass',
        outputPath: 'C:\\out\\ep01.ass',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SubtitleSpawnFn,
      })
    ).rejects.toThrow(/non-negative integer/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects on a non-zero ffmpeg exit with the captured stderr tail', async () => {
    const spawn = vi.fn(
      () => makeChildStub(1, ['Invalid argument while extracting\n']) as unknown as ChildProcess
    );
    await expect(
      extractSubtitle({
        videoPath: VIDEO,
        streamIndex: 0,
        codec: 'ass',
        outputPath: 'C:\\out\\ep01.ass',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SubtitleSpawnFn,
      })
    ).rejects.toThrow(/exited with code 1.*Invalid argument/s);
  });

  it('rejects when ffmpeg is terminated by a signal (exit code null)', async () => {
    const spawn = vi.fn(() => makeChildStub(null) as unknown as ChildProcess);
    await expect(
      extractSubtitle({
        videoPath: VIDEO,
        streamIndex: 0,
        codec: 'ass',
        outputPath: 'C:\\out\\ep01.ass',
        ffmpegPath: '/bin/ffmpeg',
        spawn: spawn as unknown as SubtitleSpawnFn,
      })
    ).rejects.toThrow(/terminated by signal/);
  });

  it('emits an info log on success with the track index + output path', async () => {
    const spawn = vi.fn(() => makeChildStub(0) as unknown as ChildProcess);
    const logs: LogLine[] = [];
    await extractSubtitle({
      videoPath: VIDEO,
      streamIndex: 1,
      codec: 'ass',
      outputPath: 'C:\\out\\ep01.ass',
      ffmpegPath: '/bin/ffmpeg',
      spawn: spawn as unknown as SubtitleSpawnFn,
      onLog: l => logs.push(l),
      now: () => 1700000000000,
    });
    expect(logs).toEqual([
      {
        ts: 1700000000000,
        level: 'info',
        text: 'Extracted subtitle track 1 → C:\\out\\ep01.ass',
      },
    ]);
  });
});
