import { useEffect, useRef, useState } from 'react';
import { IconCopy } from '@/components/ui/icons';
import { LogLine } from '@/components/ui';
import { useQueueStore, selectItemLogs } from '@/stores/useQueueStore';
import { formatTimestamp } from '@/lib/format';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/cn';

const log = logger('queue-log-panel');

interface QueueLogPanelProps {
  itemId: string;
}

/**
 * Maximum log lines kept in the rendered DOM. The store buffer is already
 * capped at 500 (see `MAX_LOGS_PER_ITEM` in `useQueueStore`); this is a
 * belt-and-braces slice so a future buffer-cap bump can't accidentally
 * push thousands of nodes into a card and tank scroll perf.
 */
const MAX_RENDERED_LINES = 500;

/**
 * Inline log panel that drops below an expanded queue card. Subscribes to a
 * single item's `logs[]` via a targeted Zustand selector so a tick on item B
 * never re-renders item A's panel — same lesson v0.1 baked into
 * `useEncodeStore` and the queue store's `selectItemProgress`.
 *
 * Expand state is session-scoped: panels close on unmount and are not
 * persisted. The buffer itself is also session-scoped (the manager never
 * writes logs to `queue.json`), so there is nothing meaningful to restore.
 */
export const QueueLogPanel = ({ itemId }: QueueLogPanelProps) => {
  const logs = useQueueStore(selectItemLogs(itemId));
  const visible = logs.length > MAX_RENDERED_LINES ? logs.slice(-MAX_RENDERED_LINES) : logs;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Auto-scroll to the bottom when a new line arrives. Mirrors the
  // `Encoding.tsx:LogPanel` pattern — read `logs.length` so the effect
  // fires on appends without subscribing to the array identity.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [logs.length]);

  const onCopy = async (): Promise<void> => {
    if (logs.length === 0) return;
    const text = logs.map(l => `[${l.ts}] ${l.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      log.warn('clipboard.writeText failed', err);
    }
  };

  return (
    <div className="mt-2 flex flex-col overflow-hidden rounded-md border border-border bg-card/40">
      <div className="flex items-center gap-2 border-b border-border bg-popover/40 px-3 py-1.5">
        <span className="font-display text-sm text-primary">録</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          ffmpeg · stderr
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">·</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          {logs.length} {logs.length === 1 ? 'line' : 'lines'}
        </span>
        <button
          type="button"
          onClick={onCopy}
          disabled={logs.length === 0}
          title={
            logs.length === 0 ? 'Nothing to copy yet' : copied ? 'Copied' : 'Copy log to clipboard'
          }
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition',
            logs.length === 0
              ? 'cursor-not-allowed border-border text-muted opacity-50'
              : copied
                ? 'border-good/60 text-good'
                : 'border-border text-muted hover:border-primary/60 hover:text-primary'
          )}
        >
          <IconCopy size={11} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div ref={bodyRef} className="max-h-[260px] min-h-[80px] overflow-y-auto px-3 py-2">
        {visible.length === 0 ? (
          <div className="py-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            no log lines yet
          </div>
        ) : (
          visible.map((l, i) => (
            <LogLine key={`${l.ts}-${i}`} ts={formatTimestamp(l.ts)} lvl={l.level} text={l.text} />
          ))
        )}
      </div>
    </div>
  );
};
