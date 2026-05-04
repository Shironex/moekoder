import type { QueueStats } from '@moekoder/shared';
import { IconChevron, IconPause, IconPlay, IconPlus } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

interface QueueSidebarProps {
  stats: QueueStats;
  running: boolean;
  paused: boolean;
  /** True when a Single-route encode is active. Disables the start CTA. */
  singleEncodeActive?: boolean;
  /** Persisted concurrency value (1..4). */
  concurrency: 1 | 2 | 3 | 4;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onAddPair: () => void;
  /** Drop handler for files / folders dropped on the rail itself. */
  onDropFiles?: (input: { paths: string[]; folderPaths?: string[] }) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/**
 * Left rail mirror of the Sidebar primitive but for the Queue route. The
 * three-stage pipeline is replaced by a "wait / live / done" stat card and
 * a Start ↔ Pause ↔ Resume CTA. Drag-and-drop into the rail enqueues new
 * pairs (using the same auto-pair pipeline as the screen drop overlay).
 */
export const QueueSidebar = ({
  stats,
  running,
  paused,
  singleEncodeActive = false,
  concurrency,
  onStart,
  onPause,
  onResume,
  onAddPair,
  collapsed = false,
  onToggleCollapsed,
}: QueueSidebarProps) => {
  // Mirror the action-bar CTA derivation so the rail and bar stay in sync
  // about pause-in-progress copy.
  let ctaLabel = 'Start queue';
  let ctaTitle = 'Run waiting items';
  let ctaDisabled = false;
  let ctaIcon = <IconPlay size={16} />;
  let onCta = onStart;
  let ctaTone: 'primary' | 'ghost' = 'primary';

  if (running && paused && stats.active > 0) {
    ctaLabel = 'Pausing…';
    ctaTitle = `Soft-pause: ${stats.active} item${stats.active === 1 ? '' : 's'} finishing`;
    ctaDisabled = true;
    ctaIcon = <IconPause size={16} />;
  } else if (running && paused) {
    ctaLabel = 'Resume';
    ctaTitle = 'Resume the dispatcher';
    onCta = onResume;
  } else if (running) {
    ctaLabel = 'Pause';
    ctaTitle = 'Soft-pause';
    onCta = onPause;
    ctaIcon = <IconPause size={16} />;
    ctaTone = 'ghost';
  } else if (singleEncodeActive) {
    ctaLabel = 'Start queue';
    ctaTitle = 'An encode is already running on Single';
    ctaDisabled = true;
  } else if (stats.wait === 0) {
    ctaLabel = 'Start queue';
    ctaTitle = 'Add at least one pair to start';
    ctaDisabled = true;
  }

  return (
    <aside
      className={cn(
        'relative z-10 flex shrink-0 flex-col gap-4 border-r border-border bg-popover/80 transition-[width] duration-200 ease-out',
        collapsed ? 'w-[64px] p-2' : 'w-[320px] p-5'
      )}
    >
      {collapsed ? (
        <div className="flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-card font-display text-xl text-primary">
            列
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-card font-display text-xl text-primary">
              列
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-sm text-foreground">Queue</span>
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                batch · 隊列
              </span>
            </div>
          </div>
          <div className="flex items-baseline gap-0.5 font-mono">
            <span className="text-xl text-primary">{stats.total}</span>
            <span className="text-muted">/</span>
            <span className="text-muted">{stats.total}</span>
          </div>
        </div>
      )}

      {/* Stats triplet */}
      {!collapsed ? (
        <div className="grid grid-cols-3 gap-2">
          <RailTile kanji="待" label="wait" value={stats.wait} tone="muted" />
          <RailTile kanji="活" label="live" value={stats.active} tone="primary" />
          <RailTile kanji="了" label="done" value={stats.done} tone="good" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <RailTileCollapsed kanji="待" value={stats.wait} tone="muted" />
          <RailTileCollapsed kanji="活" value={stats.active} tone="primary" />
          <RailTileCollapsed kanji="了" value={stats.done} tone="good" />
        </div>
      )}

      {/* Concurrency pill (compact echo of the segmented control on the screen) */}
      {!collapsed && (
        <div className="flex items-center justify-between rounded-md border border-border bg-card/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em]">
          <span className="text-muted">並行 · concurrency</span>
          <span className="text-primary">{concurrency}</span>
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={onCta}
        disabled={ctaDisabled}
        title={ctaTitle}
        aria-label={collapsed ? ctaTitle : undefined}
        className={cn(
          'group mt-1 rounded-md border transition',
          collapsed
            ? 'flex h-[56px] items-center justify-center px-0'
            : 'flex h-[64px] items-center gap-3 px-4 text-left',
          ctaDisabled
            ? 'cursor-not-allowed border-border bg-card/40 text-muted opacity-70'
            : ctaTone === 'primary'
              ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-foreground hover:bg-[color-mix(in_oklab,var(--primary)_22%,transparent)]'
              : 'border-border bg-card/40 text-foreground hover:border-primary/40'
        )}
      >
        <span
          className={cn(
            'font-display leading-none',
            collapsed ? 'text-3xl' : 'text-3xl',
            ctaDisabled ? 'text-muted/70' : 'text-primary'
          )}
        >
          {running && !paused ? '止' : '始'}
        </span>
        {!collapsed && (
          <span className="flex flex-1 flex-col">
            <span className="font-display text-base leading-tight text-foreground">{ctaLabel}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              {running ? (paused ? 'paused · 一時停止' : 'running · 進行') : 'idle · 待機'}
            </span>
          </span>
        )}
        {!collapsed && (
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted transition',
              !ctaDisabled && 'group-hover:border-primary/60 group-hover:text-primary'
            )}
          >
            {ctaIcon}
          </span>
        )}
      </button>

      {/* Add pair shortcut */}
      {!collapsed && (
        <button
          type="button"
          onClick={onAddPair}
          className="flex items-center justify-center gap-2 rounded-md border border-border bg-card/30 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground transition hover:border-primary/40 hover:text-primary"
        >
          <IconPlus size={14} />
          <span>Add pair</span>
        </button>
      )}

      <div className="flex-1" />

      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute right-0 top-1/2 z-20 flex h-12 w-4 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-sm border border-border bg-popover text-muted transition',
            'hover:border-primary/40 hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] hover:text-primary'
          )}
        >
          <IconChevron
            size={12}
            className={cn('transition-transform', collapsed ? '' : 'rotate-180')}
          />
        </button>
      )}
    </aside>
  );
};

interface RailTileProps {
  kanji: string;
  label: string;
  value: number;
  tone: 'muted' | 'primary' | 'good';
}

const TONE_GLYPH: Record<RailTileProps['tone'], string> = {
  muted: 'text-muted',
  primary: 'text-primary',
  good: 'text-good',
};

const RailTile = ({ kanji, label, value, tone }: RailTileProps) => (
  <div className="flex flex-col items-center gap-1 rounded-md border border-border bg-card/30 px-2 py-3">
    <span className={cn('font-display text-2xl leading-none', TONE_GLYPH[tone])}>{kanji}</span>
    <span className="font-display text-xl text-foreground">{value}</span>
    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{label}</span>
  </div>
);

const RailTileCollapsed = ({ kanji, value, tone }: Omit<RailTileProps, 'label'>) => (
  <div
    className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-card/30 py-2"
    title={`${value}`}
  >
    <span className={cn('font-display text-xl leading-none', TONE_GLYPH[tone])}>{kanji}</span>
    <span className="font-mono text-[10px] text-foreground">{value}</span>
  </div>
);
