import { useState, type MouseEventHandler } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { ContainerChoice, HwChoice, SaveTarget } from '@moekoder/shared';
import { IconChevron, IconPlay } from '@/components/ui';
import { basename } from '@/lib/paths';
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
  /**
   * Output uses a folder + filename pair. The extension chip on the output
   * stage is driven by the `outputExt` prop below (which mirrors the user's
   * onboarding container pick), so the rail tells the truth even when the
   * filename itself doesn't carry an extension yet.
   */
  out: { name: string; path: string } | null;
  /**
   * Lowercase output extension (e.g. `'mp4'` / `'mkv'`) — surfaces on the
   * output stage's chip. Defaults to `'mp4'` to match the legacy behaviour
   * for callers that haven't been threaded yet.
   */
  outputExt?: string;
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
  /**
   * Subtitle candidates surfaced by a multi-sub drop. When present (and >1),
   * the subs Stage exposes a dropdown to swap the active pick for any of the
   * other candidates. Empty in the common single-sub case.
   */
  subsCandidates?: string[];
  /** Swap the active subtitle pick to one of `subsCandidates`. */
  onSelectSubCandidate?: (path: string) => void;
  /**
   * Video candidates surfaced by a multi-video drop. When present (and >1),
   * the video Stage exposes a dropdown to swap the active pick.
   */
  videosCandidates?: string[];
  /** Swap the active video pick to one of `videosCandidates`. */
  onSelectVideoCandidate?: (path: string) => void;
}

interface StageProps {
  n: string;
  kanji: string;
  label: string;
  placeholder: string;
  data: PickedFile | { name: string; path: string } | null;
  /** Override for the extension chip — used by output to surface the picked container. */
  ext?: string;
  onPick: () => void;
  /** When true, renders the compact kanji-rail variant (numeral + glyph only). */
  collapsed?: boolean;
  /**
   * Optional list of swap candidates. When `>1`, the stage renders a small
   * chevron next to the ext chip; clicking opens an inline menu so the user
   * can switch the active pick without re-running the picker dialog.
   */
  candidates?: string[];
  /** Called when the user picks one of `candidates` from the dropdown. */
  onSelectCandidate?: (path: string) => void;
  /** Passed through to `CandidatesMenu` to drive copy and ARIA labels. */
  candidatesKind?: 'subtitle' | 'video';
}

interface CandidatesMenuProps {
  candidates: string[];
  selected?: string;
  onSelect: (path: string) => void;
  /** Controls trigger title, aria-label, and header copy. Defaults to 'subtitle'. */
  kind?: 'subtitle' | 'video';
  /** Called when the menu opens or closes so the parent can gate pointer events. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Inline menu listing alternate file candidates for a stage. Built on
 * `@radix-ui/react-popover` so the floating panel renders into a portal at
 * `document.body` — escapes the sidebar's stacking context so opaque surfaces
 * paint over the viewport instead of fighting the rail's translucent washes.
 * Outside-click, Escape, and focus return are handled by Radix.
 */
const CandidatesMenu = ({
  candidates,
  selected,
  onSelect,
  kind = 'subtitle',
  onOpenChange,
}: CandidatesMenuProps) => {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const isVideo = kind === 'video';
  const trackLabel = isVideo ? 'Swap video source' : 'Swap subtitle track';
  const triggerTitle = isVideo
    ? `Swap video (${candidates.length} candidates)`
    : `Swap subtitle (${candidates.length} candidates)`;
  const headerKanji = isVideo ? '映像' : '字幕';

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          aria-label={trackLabel}
          title={triggerTitle}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-sm border border-border text-muted transition',
            'hover:border-primary/50 hover:text-primary',
            open && 'border-primary/60 text-primary'
          )}
        >
          <IconChevron size={10} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          aria-label={trackLabel}
          className={cn(
            'z-50 flex max-h-[min(420px,var(--radix-popover-content-available-height))] w-[320px] flex-col rounded-md border border-border bg-card p-1',
            'shadow-[0_18px_44px_-12px_color-mix(in_oklab,black_75%,transparent),0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          <div className="mb-1 shrink-0 border-b border-border/60 px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted">
            {candidates.length} candidates · {headerKanji}
          </div>
          <div
            role="listbox"
            aria-label={trackLabel}
            className={cn(
              'flex min-h-0 flex-1 flex-col divide-y divide-border/60 overflow-y-auto',
              '[scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--primary)_30%,transparent)_transparent]'
            )}
          >
            {candidates.map(path => {
              const isActive = path === selected;
              return (
                <button
                  key={path}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onSelect(path);
                    handleOpenChange(false);
                  }}
                  className={cn(
                    'flex flex-col items-start gap-0.5 px-2 py-1.5 text-left transition',
                    'hover:bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]',
                    isActive && [
                      'border-l-2 border-primary pl-[6px]',
                      'bg-[color-mix(in_oklab,var(--primary)_12%,transparent)]',
                    ]
                  )}
                >
                  <span
                    className={cn(
                      'flex w-full items-center gap-2 truncate font-display text-sm',
                      isActive ? 'text-primary' : 'text-foreground'
                    )}
                    title={basename(path)}
                  >
                    <span className="truncate">{basename(path)}</span>
                  </span>
                  <span className="w-full truncate font-mono text-[9px] text-muted">{path}</span>
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

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
const Stage = ({
  n,
  kanji,
  label,
  placeholder,
  data,
  ext,
  onPick,
  collapsed,
  candidates,
  onSelectCandidate,
  candidatesKind,
}: StageProps) => {
  const filled = !!data;
  const resolvedExt = filled ? (ext ?? ('ext' in data! ? data!.ext : undefined)) : undefined;
  const handleClick: MouseEventHandler<HTMLButtonElement> = () => onPick();
  const showCandidates =
    !collapsed && filled && !!candidates && candidates.length > 1 && !!onSelectCandidate;
  // The native title shows the full filename on hover — critical in the
  // collapsed rail where the label text isn't visible at all.
  const tooltip = filled ? `${label}: ${data!.name}` : `${label} — ${placeholder}`;
  // Gate underlay pointer events while the candidates menu is open so an
  // outside-click that closes the menu doesn't also fire the picker dialog.
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div
      className={cn(
        'group relative grid w-full grid-cols-[44px_1fr] items-stretch gap-3 rounded-md border border-border bg-transparent p-3 transition',
        'hover:border-primary/40 hover:bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]',
        filled && 'border-primary/30 bg-[color-mix(in_oklab,var(--primary)_5%,transparent)]'
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'absolute inset-0 z-0 cursor-pointer rounded-md',
          menuOpen && 'pointer-events-none'
        )}
        aria-label={filled ? `Change ${label}: ${data!.name}` : `Pick ${label}`}
      />
      <div className="pointer-events-none relative z-[1] flex flex-col items-center justify-center gap-2 border-r border-border/60 pr-2">
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
      <div className="pointer-events-none relative z-[1] flex min-w-0 flex-col gap-1 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {label}
          </span>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]',
                filled ? 'text-foreground' : 'text-muted/70'
              )}
            >
              {filled && resolvedExt ? resolvedExt : '—'}
            </span>
            {showCandidates && (
              <CandidatesMenu
                candidates={candidates!}
                selected={data && 'path' in data ? data.path : undefined}
                onSelect={onSelectCandidate!}
                kind={candidatesKind}
                onOpenChange={setMenuOpen}
              />
            )}
          </div>
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
    </div>
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
  outputExt = 'mp4',
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
  subsCandidates,
  onSelectSubCandidate,
  videosCandidates,
  onSelectVideoCandidate,
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
          candidates={videosCandidates}
          onSelectCandidate={onSelectVideoCandidate}
          candidatesKind="video"
        />
        <Stage
          n="弐"
          kanji="字"
          label="Subtitle track"
          placeholder="ASS · SSA · SRT"
          data={subs}
          onPick={onPickSubs}
          collapsed={collapsed}
          candidates={subsCandidates}
          onSelectCandidate={onSelectSubCandidate}
          candidatesKind="subtitle"
        />
        <Stage
          n="参"
          kanji="出"
          label="Output file"
          placeholder="Save location"
          data={out}
          ext={outputExt}
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
