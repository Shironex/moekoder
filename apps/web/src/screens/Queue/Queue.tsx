import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQueueStore, selectStats } from '@/stores/useQueueStore';
import { useElectronAPI, useFilePicks, useQueueDrag, useSetting } from '@/hooks';
import { useEncodeStore } from '@/stores';
import { DropOverlay, PageHead } from '@/components/ui';
import { joinPath, basename, stripExt } from '@/lib/paths';
import { autoPairFiles, categorizePaths } from '@/lib/drop-helpers';
import { resolveOutputDir } from '@/lib/resolve-output';
import { logger } from '@/lib/logger';
import { QueueActions } from './QueueActions';
import { QueueCard } from './QueueCard';
import { QueueEmpty } from './QueueEmpty';

const log = logger('queue-screen');

interface QueueScreenProps {
  /** Trigger the same multi-file picker the rail uses for queue add. */
  onAddPair: () => void;
}

/**
 * The Queue screen. Shows the current queue items with status pills, mini
 * progress bars, and per-card affordances (force-stop, retry, remove).
 *
 * The whole screen is a drop target: dropping files / a folder will
 * auto-pair and enqueue every match in one shot, so a 12-episode batch is
 * a single drag.
 */
export const QueueScreen = ({ onAddPair }: QueueScreenProps) => {
  const api = useElectronAPI();
  const items = useQueueStore(s => s.items);
  const running = useQueueStore(s => s.running);
  const paused = useQueueStore(s => s.paused);
  const settings = useQueueStore(s => s.settings);
  const stats = useQueueStore(useShallow(selectStats));

  // Reflect the Single-route encode state so the Start CTA can be locked
  // when there's a Single-route encode in flight (the manager throws on
  // start if the orchestrator has foreign jobs, but the UI should also
  // not invite the click in the first place).
  const singleEncodePhase = useEncodeStore(s => s.phase);
  const singleEncodeActive = singleEncodePhase === 'running';

  const [saveTarget] = useSetting('saveTarget');
  const [customSavePath] = useSetting('customSavePath');
  const [container] = useSetting('container');
  const outputExt = container === 'mkv' ? 'mkv' : 'mp4';

  const { getDragProps } = useQueueDrag();

  const onConcurrencyChange = useCallback(
    (concurrency: 1 | 2 | 3 | 4) => {
      // Persist via electron-store (single source of truth) AND mirror on
      // the manager so an in-flight queue picks up the new cap immediately.
      api.store
        .set('queueConcurrency', concurrency)
        .catch(err => log.warn('store.set queueConcurrency failed', err));
      api.queue
        .setSettings({ concurrency })
        .catch(err => log.warn('queue.setSettings failed', err));
    },
    [api]
  );

  const onStart = useCallback(() => {
    api.queue.start().catch(err => log.warn('queue.start failed', err));
  }, [api]);
  const onPause = useCallback(() => {
    api.queue.pause().catch(err => log.warn('queue.pause failed', err));
  }, [api]);
  const onResume = useCallback(() => {
    api.queue.resume().catch(err => log.warn('queue.resume failed', err));
  }, [api]);
  const onClearDone = useCallback(() => {
    api.queue.clearDone().catch(err => log.warn('queue.clearDone failed', err));
  }, [api]);

  const onCancel = useCallback(
    (id: string) => {
      api.queue.cancelItem(id).catch(err => log.warn('queue.cancelItem failed', err));
    },
    [api]
  );
  const onRemove = useCallback(
    (id: string) => {
      api.queue.removeItem(id).catch(err => log.warn('queue.removeItem failed', err));
    },
    [api]
  );
  const onRetry = useCallback(
    (id: string) => {
      api.queue.retryItem(id).catch(err => log.warn('queue.retryItem failed', err));
    },
    [api]
  );

  // Drop handler: categorise, auto-pair, derive outputs, ship to manager.
  // Falls back to the same `applyDroppedFiles` heuristics the Single-route
  // sidebar already uses, but emits NewQueueItem records instead of
  // updating local picks.
  const enqueueFromDrop = useCallback(
    (input: { paths: string[]; folderPaths?: string[] }) => {
      const folderPath = input.folderPaths?.[0];
      const { videos, subtitles } = categorizePaths(input.paths);
      const { paired } = autoPairFiles(videos, subtitles);
      if (paired.length === 0) {
        log.warn('drop produced no pairs — nothing enqueued', {
          videos,
          subtitles,
        });
        return;
      }
      const newItems = paired.map(pair => {
        const videoName = basename(pair.video);
        const subtitleName = basename(pair.subtitle);
        const outputDir =
          folderPath ?? resolveOutputDir(saveTarget ?? 'moekoder', pair.video, customSavePath);
        const outputPath = joinPath(outputDir, `${stripExt(videoName)}.${outputExt}`);
        return {
          videoPath: pair.video,
          videoName,
          subtitlePath: pair.subtitle,
          subtitleName,
          outputPath,
        };
      });
      api.queue.addItems(newItems).catch(err => log.warn('queue.addItems (drop) failed', err));
    },
    [api, saveTarget, customSavePath, outputExt]
  );

  const dropOverlayContent = useMemo(
    () => (
      <section className="relative flex flex-1 flex-col gap-6 overflow-hidden px-10 py-8">
        <PageHead
          screen="queue"
          route="queue"
          title={`Queue. ${items.length} ${items.length === 1 ? 'file' : 'files'}.`}
          subtitle="Stack up your batches. MoeKoder will chew through them one by one — pause anytime, retries are automatic."
          right={
            <div className="flex flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              <span>
                wait <span className="text-foreground">{stats.wait}</span> · live{' '}
                <span className="text-foreground">{stats.active}</span> · done{' '}
                <span className="text-foreground">{stats.done}</span>
              </span>
              {stats.error > 0 && (
                <span className="text-destructive">
                  {stats.error} error{stats.error === 1 ? '' : 's'}
                </span>
              )}
            </div>
          }
        />

        <QueueActions
          stats={stats}
          running={running}
          paused={paused}
          singleEncodeActive={singleEncodeActive}
          concurrency={settings.concurrency}
          onStart={onStart}
          onPause={onPause}
          onResume={onResume}
          onClearDone={onClearDone}
          onAddPair={onAddPair}
          onConcurrencyChange={onConcurrencyChange}
        />

        {items.length === 0 ? (
          <QueueEmpty onAddPair={onAddPair} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {items.map((item, index) => (
              <QueueCard
                key={item.id}
                item={item}
                index={index}
                dragProps={getDragProps(item.id, index, item.status !== 'active')}
                onCancel={onCancel}
                onRemove={onRemove}
                onRetry={onRetry}
              />
            ))}
          </div>
        )}
      </section>
    ),
    [
      items,
      stats,
      running,
      paused,
      singleEncodeActive,
      settings.concurrency,
      onStart,
      onPause,
      onResume,
      onClearDone,
      onAddPair,
      onConcurrencyChange,
      getDragProps,
      onCancel,
      onRemove,
      onRetry,
    ]
  );

  return <DropOverlay onFiles={enqueueFromDrop}>{dropOverlayContent}</DropOverlay>;
};

/**
 * Trampoline that owns the multi-file picker for "Add pair". Calls
 * `useFilePicks.applyDroppedFiles` so dialog flows go through the same
 * categorise / auto-pair / output-derive machinery as drag-and-drop.
 */
export const QueueScreenContainer = () => {
  const api = useElectronAPI();
  const [saveTarget] = useSetting('saveTarget');
  const [customSavePath] = useSetting('customSavePath');
  const [container] = useSetting('container');
  const outputExt = container === 'mkv' ? 'mkv' : 'mp4';
  const filePicks = useFilePicks({ saveTarget, customSavePath, outputExt });

  const onAddPair = useCallback(async () => {
    try {
      const res = await api.dialog.openFiles({
        filters: [
          {
            name: 'Video + subtitle',
            extensions: [
              'mkv',
              'mp4',
              'm4v',
              'webm',
              'avi',
              'mov',
              'ts',
              'm2ts',
              'ass',
              'ssa',
              'srt',
              'vtt',
            ],
          },
        ],
      });
      if (res.canceled || res.filePaths.length === 0) return;
      // Categorise + pair using the same helpers drag-and-drop uses, then
      // ship straight to the manager. We deliberately do NOT call
      // applyDroppedFiles here because that updates Single-route state.
      const { videos, subtitles } = categorizePaths(res.filePaths);
      const { paired } = autoPairFiles(videos, subtitles);
      if (paired.length === 0) {
        log.warn('Add-pair dialog produced no auto-pairs', {
          paths: res.filePaths,
          videos,
          subtitles,
        });
        return;
      }
      const newItems = paired.map(pair => {
        const videoName = basename(pair.video);
        const subtitleName = basename(pair.subtitle);
        const outputDir = resolveOutputDir(saveTarget ?? 'moekoder', pair.video, customSavePath);
        const outputPath = joinPath(outputDir, `${stripExt(videoName)}.${outputExt}`);
        return {
          videoPath: pair.video,
          videoName,
          subtitlePath: pair.subtitle,
          subtitleName,
          outputPath,
        };
      });
      await api.queue.addItems(newItems);
    } catch (err) {
      log.warn('Add-pair flow failed', err);
    }
  }, [api, saveTarget, customSavePath, outputExt]);

  // `filePicks` is intentionally unused here — kept as a parity hook in
  // case future iterations want the same auto-pair pipeline state for
  // a sidebar preview.
  void filePicks;

  return <QueueScreen onAddPair={onAddPair} />;
};
