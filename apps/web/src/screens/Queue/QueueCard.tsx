import { useEffect, useRef, useState } from 'react';
import type { QueueItem } from '@moekoder/shared';
import { IconClose, IconPlay, IconStop } from '@/components/ui/icons';
import { useQueueStore, selectItemProgress } from '@/stores/useQueueStore';
import { cn } from '@/lib/cn';

/**
 * Numeric position formatted with kanji digits 壱..拾弐 for the first 12
 * positions, then a zero-padded decimal so 13+ stays readable. The design
 * reference uses zero-pad only — the kanji touch is a v0.3 enhancement that
 * matches the rest of the app's japonisme.
 */
const KANJI_DIGITS = ['壱', '弐', '参', '四', '五', '六', '七', '八', '九', '拾', '拾壱', '拾弐'];
const formatPosition = (index: number): string =>
  index < KANJI_DIGITS.length ? KANJI_DIGITS[index] : String(index + 1).padStart(2, '0');

interface QueueCardProps {
  item: QueueItem;
  index: number;
  /** Drag handlers from `useQueueDrag`. Undefined when drag is disabled
   *  (e.g. an `active` card mid-encode). */
  dragProps?: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    isDragOver: boolean;
    isDragging: boolean;
  };
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  wait: 'Wait',
  active: 'Live',
  done: 'Done',
  error: 'Error',
  cancelled: 'Stopped',
};

/**
 * Tone classes for the status pill. Each maps to a colour token already
 * defined by the theme system so dark/light themes get the same hierarchy
 * for free.
 */
const STATUS_TONE: Record<QueueItem['status'], string> = {
  wait: 'border-border text-muted',
  active: 'border-primary/60 bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-primary',
  done: 'border-good/40 bg-[color-mix(in_oklab,var(--good)_15%,transparent)] text-good',
  error:
    'border-destructive/40 bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive',
  cancelled: 'border-border bg-card/50 text-muted',
};

export const QueueCard = ({
  item,
  index,
  dragProps,
  onCancel,
  onRemove,
  onRetry,
}: QueueCardProps) => {
  // Subscribe to this item's progress with a TARGETED selector so a tick on
  // item B doesn't re-render item A's card. Same pattern that v0.1 added
  // to useEncodeStore.
  const liveProgress = useQueueStore(selectItemProgress(item.id));
  const progress = liveProgress ?? item.progress;
  const pct =
    item.status === 'done'
      ? 100
      : item.status === 'active' && progress
        ? Math.min(100, progress.pct)
        : 0;

  // Animate the progress bar smoothly even when ffmpeg ticks land in
  // bursts. Without the rAF easing the bar visibly stutters at speed > 1.
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
  }, [pct]);

  const [confirmRemove, setConfirmRemove] = useState(false);

  const isActive = item.status === 'active';
  const isError = item.status === 'error';
  const isCancelled = item.status === 'cancelled';
  const isDone = item.status === 'done';

  return (
    <div
      {...dragProps}
      data-item-id={item.id}
      className={cn(
        'group relative flex items-center gap-4 rounded-md border bg-card/30 px-4 py-3 transition',
        'hover:border-primary/40 hover:bg-[color-mix(in_oklab,var(--primary)_4%,transparent)]',
        isActive && 'border-primary/40 bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]',
        isDone && 'border-good/30 opacity-80',
        (isError || isCancelled) && 'border-border opacity-90',
        dragProps?.isDragging && 'opacity-50',
        dragProps?.isDragOver && 'border-primary ring-2 ring-primary/40 ring-offset-0'
      )}
    >
      {/* Position kanji */}
      <div
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border font-display text-xl',
          isActive ? 'border-primary/50 text-primary' : 'text-foreground/70'
        )}
        title={`Item ${index + 1}`}
      >
        {formatPosition(index)}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-display text-base text-foreground" title={item.videoName}>
            {item.videoName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          <span className="truncate" title={item.subtitleName}>
            {item.subtitleName}
          </span>
          {progress && isActive && (
            <>
              <span className="text-muted/50">·</span>
              <span>{progress.pct.toFixed(1)}%</span>
              <span className="text-muted/50">·</span>
              <span>{progress.fps.toFixed(0)} fps</span>
              <span className="text-muted/50">·</span>
              <span>{progress.speed.toFixed(2)}x</span>
            </>
          )}
          {item.lastError && (isError || isCancelled || item.attempts > 0) && (
            <>
              <span className="text-muted/50">·</span>
              <span
                className={cn('truncate', isError ? 'text-destructive' : 'text-muted')}
                title={item.lastError}
              >
                {item.lastError}
              </span>
            </>
          )}
        </div>

        {/* Mini progress bar */}
        <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-border/40">
          <div
            ref={fillRef}
            className={cn(
              'h-full transition-[width] duration-300 ease-out',
              isDone ? 'bg-good' : 'bg-primary'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Status pill */}
      <span
        className={cn(
          'shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em]',
          STATUS_TONE[item.status]
        )}
      >
        {STATUS_LABEL[item.status]}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {isActive && (
          <button
            type="button"
            onClick={() => onCancel(item.id)}
            title="Force stop this item"
            aria-label="Force stop"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted transition hover:border-destructive/60 hover:text-destructive"
          >
            <IconStop size={12} />
          </button>
        )}
        {(isError || isCancelled) && (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            title="Retry this item"
            aria-label="Retry"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted transition hover:border-primary/60 hover:text-primary"
          >
            <IconPlay size={12} />
          </button>
        )}
        {!isActive && (
          <button
            type="button"
            onClick={() => {
              if (confirmRemove) {
                onRemove(item.id);
                setConfirmRemove(false);
              } else {
                setConfirmRemove(true);
                window.setTimeout(() => setConfirmRemove(false), 2200);
              }
            }}
            title={confirmRemove ? 'Click again to confirm' : 'Remove from queue'}
            aria-label={confirmRemove ? 'Confirm remove' : 'Remove'}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-sm border text-muted transition',
              confirmRemove
                ? 'border-destructive text-destructive'
                : 'border-border hover:border-destructive/60 hover:text-destructive'
            )}
          >
            <IconClose size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
