/**
 * Drag-and-drop helpers for the renderer.
 *
 * Categorisation is **extension-only** by design — `File.type` is unreliable
 * for the formats Moekoder cares about (`.ass` often arrives with `type ===
 * ''`, `.mkv` only resolves to `video/x-matroska` on Linux). Filename
 * extension matches user expectations and stays stable across platforms.
 *
 * Auto-pairing follows three strategies in order; the first match wins per
 * video and subtitles are consumed via a `Set` so the same `.ass` is never
 * paired with two videos in the same drop.
 */
import { basename, extOf } from './paths';

/**
 * Renderer-side video extensions accepted by drop and the open-file dialog.
 * v0.2 list — adds `.ts` / `.m2ts` (MPEG transport streams) over the legacy
 * AG-Wypalarka set; drops `.wmv` / `.flv` which Moekoder's pipeline never
 * exercised.
 */
export const VIDEO_EXTENSIONS = [
  '.mkv',
  '.mp4',
  '.m4v',
  '.webm',
  '.avi',
  '.mov',
  '.ts',
  '.m2ts',
] as const;

/** Subtitle extensions accepted by drop and the open-file dialog. */
export const SUBTITLE_EXTENSIONS = ['.ass', '.ssa', '.srt', '.vtt'] as const;

/** `Electron.FileFilter`-shaped list for the video open-file dialog. */
export const VIDEO_DIALOG_FILTERS = [
  {
    name: 'Video',
    extensions: VIDEO_EXTENSIONS.map(e => e.slice(1)),
  },
  { name: 'All files', extensions: ['*'] },
];

/** `Electron.FileFilter`-shaped list for the subtitle open-file dialog. */
export const SUBTITLE_DIALOG_FILTERS = [
  {
    name: 'Subtitle',
    extensions: SUBTITLE_EXTENSIONS.map(e => e.slice(1)),
  },
  { name: 'All files', extensions: ['*'] },
];

/**
 * Resolve the filesystem path for a dropped `File`. Uses Electron's
 * `webUtils.getPathForFile` via the preload bridge; falls back to the legacy
 * `File.path` for tests and any non-Electron host. Empty string when neither
 * surface yields a path.
 */
function getFilePath(file: File): string {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.fileSystem?.getPathForFile) {
    try {
      return api.fileSystem.getPathForFile(file);
    } catch {
      return '';
    }
  }
  return (file as File & { path?: string }).path ?? '';
}

/** Resolve the absolute filesystem path for each dropped `File`, dropping empties. */
export function getDroppedFilePaths(files: File[]): string[] {
  return files.map(getFilePath).filter(Boolean);
}

/**
 * Split already-resolved filesystem paths into videos / subtitles / other by
 * filename extension. This is the primary categoriser — `categorizeDroppedFiles`
 * is a thin wrapper that resolves `File` objects first.
 */
export function categorizePaths(paths: string[]): {
  videos: string[];
  subtitles: string[];
  other: string[];
} {
  const videos: string[] = [];
  const subtitles: string[] = [];
  const other: string[] = [];

  for (const path of paths) {
    if (!path) continue;
    const ext = extOf(path);
    const dotExt = ext ? `.${ext}` : '';

    if ((VIDEO_EXTENSIONS as readonly string[]).includes(dotExt)) {
      videos.push(path);
    } else if ((SUBTITLE_EXTENSIONS as readonly string[]).includes(dotExt)) {
      subtitles.push(path);
    } else {
      other.push(path);
    }
  }

  return { videos, subtitles, other };
}

/**
 * Split dropped `File` objects into videos / subtitles / other by filename
 * extension. Files with no resolvable path are silently dropped.
 */
export function categorizeDroppedFiles(files: File[]): {
  videos: string[];
  subtitles: string[];
  other: string[];
} {
  return categorizePaths(files.map(getFilePath));
}

function getBaseName(filePath: string): string {
  const fileName = basename(filePath);
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.substring(0, dot) : fileName;
}

/**
 * Pair videos with subtitles using a three-stage filename heuristic:
 *
 *   1. Exact base-name match (lowercased, extension stripped).
 *   2. Video base contains subtitle base — handles `episode01_1080p.mkv` +
 *      `episode01.ass`.
 *   3. Subtitle base contains video base — handles `episode01.mkv` +
 *      `episode01_eng.ass`.
 *
 * First match wins per video. Subtitles are tracked in a `Set` so they are
 * never paired with a second video in the same drop. Unmatched videos surface
 * in `unpaired` so callers can decide whether to populate just the video
 * slot or surface a hint to the user.
 */
export function autoPairFiles(
  videos: string[],
  subtitles: string[]
): { paired: { video: string; subtitle: string }[]; unpaired: string[] } {
  const paired: { video: string; subtitle: string }[] = [];
  const usedSubtitles = new Set<string>();
  const unpaired: string[] = [];

  for (const video of videos) {
    const videoBase = getBaseName(video).toLowerCase();
    let matchedSubtitle: string | null = null;

    for (const subtitle of subtitles) {
      if (usedSubtitles.has(subtitle)) continue;
      const subBase = getBaseName(subtitle).toLowerCase();

      if (videoBase === subBase) {
        matchedSubtitle = subtitle;
        break;
      }
      if (videoBase.includes(subBase)) {
        matchedSubtitle = subtitle;
        break;
      }
      if (subBase.includes(videoBase)) {
        matchedSubtitle = subtitle;
        break;
      }
    }

    if (matchedSubtitle) {
      paired.push({ video, subtitle: matchedSubtitle });
      usedSubtitles.add(matchedSubtitle);
    } else {
      unpaired.push(video);
    }
  }

  return { paired, unpaired };
}

/** Cross-platform filename extractor — alias for `basename` from `paths.ts`. */
export function getFileName(filePath: string): string {
  return basename(filePath);
}
