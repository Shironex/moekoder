import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { logger } from '@/lib/logger';
import { SUBTITLE_EXTENSIONS, VIDEO_EXTENSIONS } from '@/lib/drop-helpers';

const log = logger('drop-overlay');

interface DroppedPayload {
  /** Resolved filesystem paths for non-folder files. */
  paths: string[];
  /** Resolved filesystem paths for any directories that were dropped. */
  folderPaths: string[];
}

interface DropOverlayProps {
  children: ReactNode;
  /**
   * Called once per drop with the categorised payload. Files are split from
   * folders inside the overlay (via `webkitGetAsEntry().isDirectory`) so the
   * consumer can route folders to the output slot without re-running the
   * detection. Empty arrays mean the user dragged something we couldn't
   * resolve (e.g. a browser tab) — silently ignored.
   */
  onFiles: (payload: DroppedPayload) => void;
}

/**
 * Full-bleed drop affordance that wraps the Idle screen. Tracks a single
 * `isDragOver` boolean and renders a tinted veil + a kanji sigil when the
 * user is hovering a file payload over the window.
 *
 * The `dataTransfer.types.includes('Files')` guard on every event keeps the
 * overlay from triggering on selected text or in-app drags. The
 * `currentTarget.contains(relatedTarget)` early-return on `dragLeave`
 * prevents the well-known flicker when the cursor crosses a child element.
 *
 * Folder detection runs synchronously via
 * `DataTransferItem.webkitGetAsEntry().isDirectory` because a directory's
 * `File.path` resolves to the directory itself when produced by a drop;
 * we still record the matched item indices so the file-path resolution
 * downstream can ignore them.
 */
export const DropOverlay = ({ children, onFiles }: DropOverlayProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  // Counter avoids the tracked-state flicker if a synthetic dragEnter fires
  // while we're still over a child. We bump on enter, decrement on leave,
  // and only flip `isDragOver` when the count crosses zero.
  const enterCountRef = useRef(0);

  const hasFiles = useCallback((e: DragEvent<HTMLElement>): boolean => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    // `types` is a DOMStringList in some shims; iterate defensively.
    for (let i = 0; i < types.length; i += 1) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }, []);

  const onDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      enterCountRef.current += 1;
      if (enterCountRef.current === 1) setIsDragOver(true);
    },
    [hasFiles]
  );

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      if (!hasFiles(e)) return;
      // Required to allow a drop. `dropEffect = 'copy'` keeps the OS cursor
      // honest — Windows otherwise shows a "no entry" badge by default.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    },
    [hasFiles]
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>): void => {
    // Re-entering a child fires dragLeave on the parent first — early-return
    // when the relatedTarget is still inside us so we don't visually drop
    // and re-show on every internal boundary cross.
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    enterCountRef.current = Math.max(0, enterCountRef.current - 1);
    if (enterCountRef.current === 0) setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      enterCountRef.current = 0;
      setIsDragOver(false);

      const items = e.dataTransfer?.items;
      const files = e.dataTransfer?.files;

      const fileList: File[] = [];
      const folderFiles: File[] = [];

      if (items && files) {
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i];
          if (item.kind !== 'file') continue;
          const file = files[i];
          if (!file) continue;
          const entry = item.webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            folderFiles.push(file);
          } else {
            fileList.push(file);
          }
        }
      } else if (files) {
        for (let i = 0; i < files.length; i += 1) fileList.push(files[i]);
      }

      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      const resolve = (file: File): string => {
        try {
          return api?.fileSystem?.getPathForFile?.(file) ?? '';
        } catch {
          return '';
        }
      };

      const directPaths = fileList.map(resolve).filter(Boolean);
      const folderPaths = folderFiles.map(resolve).filter(Boolean);

      log.info('drop received', {
        rawFiles: fileList.length,
        rawFolders: folderFiles.length,
        resolvedPaths: directPaths,
        resolvedFolders: folderPaths,
      });

      // Async tail: enumerate any dropped folders so their contents reach the
      // auto-pair pipeline. The folder itself is still surfaced to the
      // consumer as the output-slot target. We do not block the user's
      // visual feedback — the overlay already cleared above.
      const finish = (enumeratedPaths: string[]): void => {
        const merged = [...directPaths, ...enumeratedPaths];
        if (merged.length === 0 && folderPaths.length === 0) {
          log.warn('drop produced no resolvable paths — webUtils.getPathForFile may have failed');
          return;
        }
        onFiles({ paths: merged, folderPaths });
      };

      if (folderPaths.length === 0 || !api?.fileSystem?.listFolder) {
        finish([]);
        return;
      }

      Promise.all(
        folderPaths.map(async folderPath => {
          try {
            const result = await api.fileSystem.listFolder({
              folderPath,
              videoExtensions: [...VIDEO_EXTENSIONS],
              subtitleExtensions: [...SUBTITLE_EXTENSIONS],
            });
            log.info('folder enumerated', { folderPath, ...result });
            return [...result.videos, ...result.subtitles];
          } catch (err) {
            log.error('folder enumeration failed', { folderPath, err });
            return [];
          }
        })
      ).then(perFolder => finish(perFolder.flat()));
    },
    [hasFiles, onFiles]
  );

  return (
    <div
      className="relative flex flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}
      <div
        aria-hidden={!isDragOver}
        className={cn(
          'pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-4',
          'bg-[color-mix(in_oklab,var(--background)_85%,transparent)]',
          'backdrop-blur-sm transition-opacity duration-150',
          isDragOver ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-primary/60 bg-card/60 px-12 py-10 shadow-[0_0_60px_color-mix(in_oklab,var(--primary)_20%,transparent)]">
          <span
            className="font-display text-7xl text-primary drop-shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
            aria-hidden
          >
            投
          </span>
          <span className="font-display text-2xl text-foreground">Drop it in.</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            video · subs · folder · auto-paired
          </span>
        </div>
      </div>
    </div>
  );
};
