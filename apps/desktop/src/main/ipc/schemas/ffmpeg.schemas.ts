import { z } from 'zod';

/** `ffmpeg:is-installed` — no args. */
export const ffmpegIsInstalledSchema = z.tuple([]);

/** `ffmpeg:get-version` — no args. */
export const ffmpegGetVersionSchema = z.tuple([]);

/**
 * `ffmpeg:ensure-binaries` — no args. Progress is pushed over the
 * `ffmpeg:download-progress` event channel, not returned from this call.
 */
export const ffmpegEnsureBinariesSchema = z.tuple([]);

/**
 * `ffmpeg:remove-installed` — no args. Deletes the installed ffmpeg +
 * ffprobe binaries from `<userData>/bin`. Used by the Settings "Reinstall
 * ffmpeg" flow; callers typically redirect to onboarding afterwards so the
 * Engine step re-runs and re-downloads.
 */
export const ffmpegRemoveInstalledSchema = z.tuple([]);

/** `ffmpeg:probe` — takes a single absolute file path string. */
export const ffmpegProbeSchema = z.tuple([z.string().min(1)]);
