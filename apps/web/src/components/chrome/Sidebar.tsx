import type { MouseEventHandler } from 'react';
import type { ContainerChoice, HwChoice, SaveTarget } from '@moekoder/shared';
import { IconChevron, IconPlay } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * One picked file/folder reference. Mirrors the minimal shape the sidebar
 * needs from an Electron file dialog — anything richer (probe results, size,
 * …) lives on the parent.
 */
export interface PickedFile {
  name: string;
  path: string;
  ext?: string;
}

/**
 * Rail-stat triplet shown along the sidebar's bottom edge. Falls back to
 * a dimmed placeholder when the parent hasn't wired real data yet.
 */
export interface SidebarProps {
  video: PickedFile | null;
  subs: PickedFile | null;
  /** Output uses a folder + filename pair; no ext chip — always `.mp4`. */
  out: { name: string; path: string } | null;
  onPickVideo: () => void;
  onPickSubs: () => void;
  onPickOut: () => void;
  onStart: () => void;
  /**
   * True while an encode is in flight. Disables the Begin encode CTA and
   * swaps its copy — otherwise the user can fire a second job while the
   * first is still running (the encode orchestrator would reject it but
   * the UI should never invite the click in the first place).
   */
  encoding?: boolean;
  /**
   * User's onboarding picks, surfaced on the rail-bottom stat row so the user
   * can see their encoding profile at a glance without opening Settings.
   * Each is nullable because `useSetting` hydrates asynchronously — the
   * stat falls back to `—` while the store read is in flight.
   */
  saveTarget?: SaveTarget | null;
  hwChoice?: HwChoice | null;
  container?: ContainerChoice | null;
  /**
   * When true, the sidebar renders as a ~64px kanji rail: header shrinks to
   * the sigil tile, stages keep only the numeral + identity kanji, the CTA
   * shows just its glyph, and the rail stats are hidden. The user toggles
   * between states via the floating edge handle (or `Ctrl/Cmd+B`).
   */
  collapsed?: boolean;
  /** Handler invoked from the edge handle. Required when `collapsed` is wired. */
  onToggleCollapsed?: () => void;
}

interface StageProps {
  n: string;
  kanji: string;
  label: string;
  placeholder: string;
  data: PickedFile | { name: string; path: string } | null;
  /** Override for the extension chip — used by output to always show `mp4`. */
  ext?: string;
  onPick: () => void;
  /** When true, renders the compact kanji-rail variant (numeral + glyph only). */
  collapsed?: boolean;
}

/**
 * Tailwind-authored stage card. Visually matches the design's `.stage`
 * tri-column layout (number/kanji spine · body · status ext) without any
 * component-level CSS file. The kanji + number combos are fixed at the
 * call-site; this primitive only handles presentation + click-to-pick.
 *
 * `collapsed` swaps the tri-column layout for a compact single-column tile
 * (numeral kanji above identity kanji). The same button, hover, and fill
 * states apply — no separate component — so expanding mid-encode doesn't
 * reset any DOM state.
 */
const Stage = ({ n, kanji, label, placeholder, data, ext, onPick, collapsed }: StageProps) => {
  const filled = !!data;
  const resolvedExt = filled ? (ext ?? ('ext' in data! ? data!.ext : undefined)) : undefined;
  const handleClick: MouseEventHandler<HTMLButtonElement> = () => onPick();
  // The native title shows the full filename on hover — critical in the
  // collapsed rail where the label text isn't visible at all.
  const tooltip = filled ? `${label}: ${data!.name}` : `${label} — ${placeholder}`;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={tooltip}
        aria-label={tooltip}
        className={cn(
          'group relative flex w-full flex-col items-center justify-center gap-1 rounded-md border border-border bg-transparent py-3 transition',
          'hover:border-primary/40 hover:bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]',
          filled && 'border-primary/30 bg-[color-mix(in_oklab,var(--primary)_5%,transparent)]'
        )}
      >
        {filled && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary"
            aria-hidden
          />
        )}
        <span
          className={cn(
            'font-mono text-[10px] tracking-[0.15em] transition',
            filled ? 'text-primary' : 'text-muted'
          )}
        >
          {n}
        </span>
        <span
          className={cn(
            'font-display text-2xl leading-none transition',
            filled ? 'text-primary' : 'text-foreground/40'
          )}
        >
          {kanji}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group grid w-full grid-cols-[44px_1fr] items-stretch gap-3 rounded-md border border-border bg-transparent p-3 text-left transition',
        'hover:border-primary/40 hover:bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]',
        filled && 'border-primary/30 bg-[color-mix(in_oklab,var(--primary)_5%,transparent)]'
      )}
    >
      <div className="flex flex-col items-center justify-center gap-2 border-r border-border/60 pr-2">
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-sm border border-border font-mono text-[11px] tracking-[0.15em] transition',
            filled
              ? 'border-primary/40 bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-primary'
              : 'text-muted'
          )}
        >
          <span>{n}</span>
        </div>
        <div
          className={cn(
            'font-display text-2xl leading-none transition',
            filled ? 'text-primary' : 'text-foreground/40'
          )}
        >
          {kanji}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {label}
          </span>
          <span
            className={cn(
              'rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]',
              filled ? 'text-foreground' : 'text-muted/70'
            )}
          >
            {filled && resolvedExt ? resolvedExt : '—'}
          </span>
        </div>
        <div
          className={cn(
            'truncate font-display text-lg leading-tight',
            filled ? 'text-foreground' : 'text-foreground/45'
          )}
          title={filled ? data!.name : placeholder}
        >
          {filled ? data!.name : placeholder}
        </div>
        <div className="truncate font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
          {filled ? data!.path : <em className="not-italic text-muted/80">click to pick</em>}
        </div>
      </div>
    </button>
  );
};

interface RailStatProps {
  kanji: string;
  /** `good` tints the glyph with the status-good color. */
  tone?: 'default' | 'good';
  value: string;
  sublabel: string;
}

const RailStat = ({ kanji, tone = 'default', value, sublabel }: RailStatProps) => (
  <div className="flex min-w-0 flex-1 items-center gap-2">
    <span
      className={cn(
        'font-display text-2xl leading-none',
        tone === 'good' ? 'text-good' : 'text-primary/80'
      )}
    >
      {kanji}
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-display text-sm text-foreground">{value}</span>
      <span className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        {sublabel}
      </span>
    </span>
  </div>
);

/**
 * Left-rail pipeline. Three picker stages (video · subtitle · output) feed
 * a large "Begin encode" CTA and a terse hardware/disk/codec stat row. The
 * CTA is only armed when all three ingredients are present.
 *
 * All layout is Tailwind utility classes referencing the design tokens
 * bridged through `@theme inline` in `globals.css`.
 */
export const Sidebar = ({
  video,
  subs,
  out,
  onPickVideo,
  onPickSubs,
  onPickOut,
  onStart,
  encoding = false,
  saveTarget,
  hwChoice,
  container,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) => {
  const filledCount = [video, subs, out].filter(Boolean).length;
  const armed = filledCount === 3 && !encoding;
  const ctaTooltip = encoding
    ? 'Encoding in progress'
    : armed
      ? 'Begin encode'
      : `${3 - filledCount} ingredient${3 - filledCount === 1 ? '' : 's'} to go`;

  return (
    <aside
      className={cn(
        'relative z-10 flex shrink-0 flex-col gap-4 border-r border-border bg-popover/80 transition-[width] duration-200 ease-out',
        collapsed ? 'w-[64px] p-2' : 'w-[320px] p-5'
      )}
    >
      {/* Header */}
      {collapsed ? (
        <div className="flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-card font-display text-xl text-primary">
            三
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-card font-display text-xl text-primary">
              三
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-sm text-foreground">Pipeline</span>
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                three ingredients · 三素材
              </span>
            </div>
          </div>
          <div className="flex items-baseline gap-0.5 font-mono">
            <span className="text-xl text-primary">{filledCount}</span>
            <span className="text-muted">/</span>
            <span className="text-muted">3</span>
          </div>
        </div>
      )}

      {/* Stages */}
      <div className="flex flex-col gap-2">
        <Stage
          n="壱"
          kanji="映"
          label="Video source"
          placeholder="MKV · MP4 · any video"
          data={video}
          onPick={onPickVideo}
          collapsed={collapsed}
        />
        <Stage
          n="弐"
          kanji="字"
          label="Subtitle track"
          placeholder="ASS · SSA · SRT"
          data={subs}
          onPick={onPickSubs}
          collapsed={collapsed}
        />
        <Stage
          n="参"
          kanji="出"
          label="Output file"
          placeholder="Save location"
          data={out}
          ext="mp4"
          onPick={onPickOut}
          collapsed={collapsed}
        />
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onStart}
        disabled={!armed}
        aria-busy={encoding || undefined}
        title={collapsed ? ctaTooltip : undefined}
        aria-label={collapsed ? ctaTooltip : undefined}
        className={cn(
          'group mt-1 rounded-md border transition',
          collapsed
            ? 'relative flex h-[56px] items-center justify-center px-0'
            : 'flex h-[72px] items-center gap-3 px-4 text-left',
          armed
            ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-foreground hover:bg-[color-mix(in_oklab,var(--primary)_22%,transparent)]'
            : encoding
              ? 'cursor-not-allowed border-transparent bg-card/40 text-muted'
              : 'cursor-not-allowed border-border bg-card/40 text-muted opacity-70'
        )}
      >
        <span
          className={cn(
            'font-display leading-none',
            collapsed ? 'text-3xl' : 'text-4xl',
            armed ? 'text-primary' : encoding ? 'text-primary/60' : 'text-muted/70'
          )}
        >
          {encoding ? '焼' : '斬'}
        </span>
        {!collapsed && (
          <span className="flex flex-1 flex-col">
            <span className="font-display text-lg leading-tight text-foreground">
              {encoding ? 'Encoding…' : 'Begin encode'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              {encoding
                ? 'in progress · 進行'
                : armed
                  ? 'all three · ready'
                  : `${3 - filledCount} to go`}
            </span>
          </span>
        )}
        {!collapsed && (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-sm border transition',
              armed
                ? 'border-primary/60 text-primary group-hover:translate-x-0.5'
                : encoding
                  ? 'border-primary/40 text-primary/70'
                  : 'border-border text-muted'
            )}
          >
            {encoding ? (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            ) : (
              <IconPlay size={14} />
            )}
          </span>
        )}
        {collapsed && encoding && (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
            aria-hidden
          />
        )}
      </button>

      {/* Spacer pushes rail stats down without fighting flex */}
      <div className="flex-1" />

      {/* Rail stats — hidden on the narrow rail; the three stats don't fit
          at 64px and the trio reads as noise when compressed. */}
      {!collapsed && (
        <div className="flex items-stretch gap-3 border-t border-border pt-4">
          <RailStat
            kanji="貯"
            value={saveTarget ? saveTarget.toUpperCase() : '—'}
            sublabel="save · folder"
          />
          <div className="w-px self-stretch bg-border" />
          <RailStat
            kanji="核"
            tone={hwChoice && hwChoice !== 'cpu' ? 'good' : 'default'}
            value={hwChoice ? hwChoice.toUpperCase() : '—'}
            sublabel="gpu · encoder"
          />
          <div className="w-px self-stretch bg-border" />
          <RailStat
            kanji="符"
            value="h264"
            sublabel={container ? `codec · ${container}` : 'codec · —'}
          />
        </div>
      )}

      {/* Floating edge handle — half-straddles the right border so it reads
          as a deliberate grip rather than a bolt-on button. Hidden when no
          toggle handler is wired so consumers that don't care about the
          collapsible behavior (tests, storybook) aren't forced to handle it. */}
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
