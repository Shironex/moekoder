import { useCallback, useState } from 'react';
import type { SaveTarget } from '@moekoder/shared';
import type { PickedFile } from '@/components/chrome';
import { basename, extOf, stripExt } from '@/lib/paths';
import { logger } from '@/lib/logger';
import { resolveOutputDir } from '@/lib/resolve-output';
import { useElectronAPI } from './useElectronAPI';

const log = logger('file-picks');

const VIDEO_FILTERS = [
  { name: 'Video', extensions: ['mkv', 'mp4', 'mov', 'avi', 'webm', 'm4v'] },
  { name: 'All files', extensions: ['*'] },
];
const SUB_FILTERS = [
  { name: 'Subtitle', extensions: ['ass', 'ssa', 'srt'] },
  { name: 'All files', extensions: ['*'] },
];

interface UseFilePicksOptions {
  /** Onboarding save preference; `null` until `useSetting` hydrates. */
  saveTarget: SaveTarget | null;
  /** Custom save root for `saveTarget === 'custom' | 'subbed'`. */
  customSavePath: string | null;
  /** Target extension for the auto-populated output name. */
  outputExt: string;
}

interface FilePicks {
  video: PickedFile | null;
  subs: PickedFile | null;
  out: { name: string; path: string } | null;
  onPickVideo: () => Promise<void>;
  onPickSubs: () => Promise<void>;
  onPickOut: () => Promise<void>;
  /** Clear all three picks — used when returning to idle after a finished encode. */
  reset: () => void;
}

/**
 * Owns the renderer-local video / subtitles / output picks and the three
 * dialog handlers that populate them. Picking a video also auto-populates
 * the output target from the onboarding save preference — the user can
 * still override via the Output stage, and the derivation is skipped until
 * `saveTarget` hydrates so we never derive against a stale default.
 */
export const useFilePicks = ({
  saveTarget,
  customSavePath,
  outputExt,
}: UseFilePicksOptions): FilePicks => {
  const api = useElectronAPI();
  const [video, setVideo] = useState<PickedFile | null>(null);
  const [subs, setSubs] = useState<PickedFile | null>(null);
  const [out, setOut] = useState<{ name: string; path: string } | null>(null);

  const onPickVideo = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: VIDEO_FILTERS });
      if (res.canceled || !res.filePath) return;
      const name = basename(res.filePath);
      setVideo({ name, path: res.filePath, ext: extOf(res.filePath) });

      if (saveTarget) {
        const outputDir = resolveOutputDir(saveTarget, res.filePath, customSavePath);
        const outputName = `${stripExt(name)}.${outputExt}`;
        setOut({ name: outputName, path: outputDir });
      }
    } catch (err) {
      log.error('dialog.openFile video failed', err);
    }
  }, [api, saveTarget, customSavePath, outputExt]);

  const onPickSubs = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: SUB_FILTERS });
      if (res.canceled || !res.filePath) return;
      const name = basename(res.filePath);
      setSubs({ name, path: res.filePath, ext: extOf(res.filePath) });
    } catch (err) {
      log.error('dialog.openFile subs failed', err);
    }
  }, [api]);

  const onPickOut = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFolder({});
      if (res.canceled || !res.folderPath) return;
      const baseName = video ? `${stripExt(video.name)}.${outputExt}` : `output.${outputExt}`;
      setOut({ name: baseName, path: res.folderPath });
    } catch (err) {
      log.error('dialog.openFolder failed', err);
    }
  }, [api, video, outputExt]);

  const reset = useCallback((): void => {
    setVideo(null);
    setSubs(null);
    setOut(null);
  }, []);

  return { video, subs, out, onPickVideo, onPickSubs, onPickOut, reset };
};
