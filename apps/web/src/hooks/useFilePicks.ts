import { useCallback, useState } from 'react';
import type { SaveTarget } from '@moekoder/shared';
import type { PickedFile } from '@/components/chrome';
import {
  SUBTITLE_DIALOG_FILTERS,
  VIDEO_DIALOG_FILTERS,
  autoPairFiles,
  categorizePaths,
} from '@/lib/drop-helpers';
import { basename, extOf, stripExt } from '@/lib/paths';
import { logger } from '@/lib/logger';
import { dirnameOf, resolveOutputDir } from '@/lib/resolve-output';
import { useElectronAPI } from './useElectronAPI';

const log = logger('file-picks');

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
  /**
   * Subtitle candidates surfaced by the most recent drop. When >1 subtitle
   * arrived in a single drop, this carries the full set so the rail can
   * expose a dropdown to swap between them. Empty when there is no
   * ambiguity (single subtitle, or no drop yet).
   */
  subsCandidates: string[];
  /**
   * Video candidates surfaced by the most recent drop. When >1 video
   * arrived in a single drop, this carries the full set so the rail can
   * expose a dropdown to swap between them. Empty in the common single-video
   * case.
   */
  videosCandidates: string[];
  onPickVideo: () => Promise<void>;
  onPickSubs: () => Promise<void>;
  onPickOut: () => Promise<void>;
  /**
   * Replace the active subtitle pick with one of the surfaced candidates.
   * Does not mutate `subsCandidates` so the user can swap repeatedly.
   */
  selectSubCandidate: (path: string) => void;
  /**
   * Replace the active video pick with one of the surfaced candidates.
   * Does not mutate `videosCandidates` so the user can swap repeatedly.
   * Re-derives the output target only when the user has not manually
   * overridden it (`outUserDirty` guard).
   */
  selectVideoCandidate: (path: string) => void;
  /**
   * Populate slots from a drag-and-drop event (or a multi-file dialog pick).
   * Auto-pairs videos with subtitles by filename similarity, treats any
   * dropped folder as the output target, and uses the same setter pipeline
   * as the click-driven `onPick*` callbacks so the output-folder derivation
   * stays consistent across entry points.
   */
  applyDroppedFiles: (input: { paths: string[]; folderPaths?: string[] }) => void;
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
  const [subsCandidates, setSubsCandidates] = useState<string[]>([]);
  const [videosCandidates, setVideosCandidates] = useState<string[]>([]);
  // True after the user manually picks an output folder via the Output stage
  // dialog. Prevents `setVideoFromPath` from clobbering a deliberate override
  // when the user later swaps the active video candidate.
  const [outUserDirty, setOutUserDirty] = useState(false);

  /**
   * Shared setter for "the user picked a video at `path`". Mirrors the
   * click-flow behavior 1:1: derives the output target from `saveTarget` +
   * `customSavePath`, names the output `<base>.<outputExt>`. Drop and click
   * call this so the two paths can never drift.
   */
  const setVideoFromPath = useCallback(
    (path: string, skipOutDerive = false): void => {
      const name = basename(path);
      setVideo({ name, path, ext: extOf(path) });

      if (!skipOutDerive && saveTarget) {
        const outputDir = resolveOutputDir(saveTarget, path, customSavePath);
        const outputName = `${stripExt(name)}.${outputExt}`;
        setOut({ name: outputName, path: outputDir });
      }
    },
    [saveTarget, customSavePath, outputExt]
  );

  const setSubsFromPath = useCallback((path: string): void => {
    setSubs({ name: basename(path), path, ext: extOf(path) });
  }, []);

  /**
   * Set the output folder. When the user has not yet picked a video the
   * filename falls back to a generic `output.<ext>`; once a video exists
   * the filename derives from it, matching the click-flow `onPickOut`.
   */
  const setOutFromFolder = useCallback(
    (folderPath: string, fallbackVideoName?: string): void => {
      const sourceName = fallbackVideoName ?? video?.name;
      const baseName = sourceName ? `${stripExt(sourceName)}.${outputExt}` : `output.${outputExt}`;
      setOut({ name: baseName, path: folderPath });
    },
    [video, outputExt]
  );

  const onPickVideo = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: VIDEO_DIALOG_FILTERS });
      if (res.canceled || !res.filePath) return;
      setOutUserDirty(false);
      setVideosCandidates([]);
      setVideoFromPath(res.filePath);
    } catch (err) {
      log.error('dialog.openFile video failed', err);
    }
  }, [api, setVideoFromPath]);

  const onPickSubs = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: SUBTITLE_DIALOG_FILTERS });
      if (res.canceled || !res.filePath) return;
      setSubsFromPath(res.filePath);
      setSubsCandidates([]);
    } catch (err) {
      log.error('dialog.openFile subs failed', err);
    }
  }, [api, setSubsFromPath]);

  const selectSubCandidate = useCallback(
    (path: string): void => {
      setSubsFromPath(path);
    },
    [setSubsFromPath]
  );

  const selectVideoCandidate = useCallback(
    (path: string): void => {
      setVideoFromPath(path, outUserDirty);
    },
    [setVideoFromPath, outUserDirty]
  );

  const onPickOut = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFolder({});
      if (res.canceled || !res.folderPath) return;
      setOutFromFolder(res.folderPath);
      setOutUserDirty(true);
    } catch (err) {
      log.error('dialog.openFolder failed', err);
    }
  }, [api, setOutFromFolder]);

  const applyDroppedFiles = useCallback(
    (input: { paths: string[]; folderPaths?: string[] }): void => {
      const folderPath = input.folderPaths?.[0];
      // A folder drop is itself an explicit output pick that should win over
      // any prior manual selection; in every other branch we preserve the
      // user's deliberate `onPickOut` choice (`outUserDirty === true`) so a
      // file-only drop never silently overwrites it.
      const preserveManualOut = outUserDirty && !folderPath;

      const { videos, subtitles, other } = categorizePaths(input.paths);
      log.info('apply dropped files', {
        paths: input.paths.length,
        folders: input.folderPaths?.length ?? 0,
        videos: videos.length,
        subtitles: subtitles.length,
        other: other.length,
      });

      const { paired, unpaired } = autoPairFiles(videos, subtitles);
      log.info('auto-pair result', {
        paired: paired.length,
        unpaired: unpaired.length,
        firstPair: paired[0],
      });

      const firstPaired = paired[0];
      let videoForOutput: string | null = null;
      // Skip the per-video output derivation when either the user already
      // committed to a manual output (preserve it) or the folder branch
      // below will own the output write (avoids a wasted intermediate set).
      const skipOutDerive = preserveManualOut || !!folderPath;

      if (firstPaired) {
        setVideoFromPath(firstPaired.video, skipOutDerive);
        setSubsFromPath(firstPaired.subtitle);
        videoForOutput = firstPaired.video;
      } else if (unpaired.length > 0) {
        setVideoFromPath(unpaired[0], skipOutDerive);
        videoForOutput = unpaired[0];
        // Clear stale subs so a previous drop's subtitle doesn't ride along
        // with the newly dropped video and silently get encoded.
        setSubs(null);
        if (subtitles.length > 0) {
          log.warn('video did not name-match any subtitle — subtitle slot left empty', {
            video: unpaired[0],
            availableSubtitles: subtitles,
          });
        }
      } else if (subtitles.length > 0) {
        setSubsFromPath(subtitles[0]);
      }

      if (videos.length > 1) {
        log.warn('multiple videos dropped — only the first paired/unpaired wins', { videos });
      }
      // Surface every subtitle from this drop as a candidate so the user can
      // swap via the inline rail dropdown. Empty when there is no ambiguity
      // (≤1 subtitle), so the dropdown stays hidden in the common case.
      setSubsCandidates(subtitles.length > 1 ? subtitles : []);
      // Same for videos: surface them when more than one arrived so the video
      // stage can offer a swap dropdown. Empty in the single-video common case.
      setVideosCandidates(videos.length > 1 ? videos : []);
      if (subtitles.length > 1 && firstPaired) {
        const consumed = firstPaired.subtitle;
        log.warn('multiple subtitles dropped — surfaced as swap candidates', {
          used: consumed,
          others: subtitles.filter(s => s !== consumed),
        });
      }

      if (folderPath) {
        // If we have a video, base the filename on it; otherwise the
        // generic `output.<ext>` fallback inside `setOutFromFolder` runs.
        // Pass the source name explicitly because state-from-`setVideoFromPath`
        // hasn't flushed yet within this callback.
        const fallbackName = videoForOutput ? basename(videoForOutput) : undefined;
        setOutFromFolder(folderPath, fallbackName);
        // The dropped folder is a deliberate output target — mark dirty so a
        // later video-candidate swap doesn't re-derive output from saveTarget
        // and silently clobber the dropped folder.
        setOutUserDirty(true);
      } else if (videoForOutput && !saveTarget && !preserveManualOut) {
        // Edge case: no folder dropped and `saveTarget` hasn't hydrated.
        // Fall back to the video's directory so the slot still fills, but
        // never clobber a manual `onPickOut` selection.
        const dir = dirnameOf(videoForOutput);
        if (dir) {
          setOutFromFolder(dir, basename(videoForOutput));
          setOutUserDirty(true);
        }
      }
    },
    [setVideoFromPath, setSubsFromPath, setOutFromFolder, saveTarget, outUserDirty]
  );

  const reset = useCallback((): void => {
    setVideo(null);
    setSubs(null);
    setOut(null);
    setSubsCandidates([]);
    setVideosCandidates([]);
    setOutUserDirty(false);
  }, []);

  return {
    video,
    subs,
    out,
    subsCandidates,
    videosCandidates,
    onPickVideo,
    onPickSubs,
    onPickOut,
    selectSubCandidate,
    selectVideoCandidate,
    applyDroppedFiles,
    reset,
  };
};
