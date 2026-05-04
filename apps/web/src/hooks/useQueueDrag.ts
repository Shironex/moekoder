import { useCallback, useState } from 'react';
import { useElectronAPI } from './useElectronAPI';
import { logger } from '@/lib/logger';

const log = logger('queue-drag');

interface DragProps {
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
}

interface UseQueueDragResult {
  /**
   * Build the drag handlers for one card. Pass `enabled = false` for items
   * whose drag should be disabled (active items mid-encode). When disabled,
   * `draggable` flips off so the browser doesn't surface the drag affordance.
   */
  getDragProps: (itemId: string, index: number, enabled?: boolean) => DragProps;
}

/**
 * Native HTML5 drag-reorder. The queue stays small (<50 items in normal
 * use), so a virtualised dependency would be overkill. Each card binds the
 * handlers via `getDragProps(id, index)` and the manager handles the
 * splice on `queue:reorder`.
 */
export const useQueueDrag = (): UseQueueDragResult => {
  const api = useElectronAPI();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const getDragProps = useCallback(
    (itemId: string, index: number, enabled = true): DragProps => ({
      draggable: enabled,
      isDragOver: overId === itemId && draggingId !== itemId,
      isDragging: draggingId === itemId,
      onDragStart: (e: React.DragEvent) => {
        if (!enabled) return;
        setDraggingId(itemId);
        setDraggingIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Setting any data is required on Firefox for the drag to actually
        // start. The id payload is also useful in case a sibling consumer
        // wants to filter.
        e.dataTransfer.setData('text/x-moekoder-queue-item', itemId);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!enabled || draggingId === null || draggingId === itemId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOverId(itemId);
      },
      onDragLeave: () => {
        if (overId === itemId) setOverId(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggingIndex === null || draggingIndex === index) {
          setDraggingId(null);
          setOverId(null);
          setDraggingIndex(null);
          return;
        }
        api.queue.reorder(draggingIndex, index).catch(err => log.warn('queue.reorder failed', err));
        setDraggingId(null);
        setOverId(null);
        setDraggingIndex(null);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverId(null);
        setDraggingIndex(null);
      },
    }),
    [api, draggingId, overId, draggingIndex]
  );

  return { getDragProps };
};
