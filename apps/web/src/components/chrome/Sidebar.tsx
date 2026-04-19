import type { MouseEventHandler } from 'react';
import { IconPlay } from '@/components/ui';
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
  /** GPU availability summary — e.g. `{ label: 'NVENC', detail: 'gpu · ready' }`. */
  gpu?: { label: string; detail: string } | null;
  /** Human-readable free-space value — e.g. `"3.16 TB"`. */
  freeBytesLabel?: string | null;
  /** Disk identifier for the value (e.g. `"D:"`). */
  freeBytesDisk?: string | null;
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
}

/**
 * Tailwind-authored stage card. Visually matches the design's `.stage`
 * tri-column layout (number/kanji spine · body · status ext) without any
 * component-level CSS file. The kanji + number combos are fixed at the
 * call-site; this primitive only handles presentation + click-to-pick.
 */
const Stage = ({ n, kanji, label, placeholder, data, ext, onPick }: StageProps) => {
  const filled = !!data;
  const resolvedExt = filled ? (ext ?? ('ext' in data! ? data!.ext : undefined)) : undefined;
  const handleClick: MouseEventHandler<HTMLButtonElement> = () => onPick();

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
  gpu,
  freeBytesLabel,
  freeBytesDisk,
}: SidebarProps) => {
  const filledCount = [video, subs, out].filter(Boolean).length;
  const ready = filledCount === 3;

  return (
    <aside className="relative z-10 flex w-[320px] shrink-0 flex-col gap-4 border-r border-border bg-popover/80 p-5">
      {/* Header */}
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

      {/* Stages */}
      <div className="flex flex-col gap-2">
        <Stage
          n="壱"
          kanji="映"
          label="Video source"
          placeholder="MKV · MP4 · any video"
          data={video}
          onPick={onPickVideo}
        />
        <Stage
          n="弐"
          kanji="字"
          label="Subtitle track"
          placeholder="ASS · SSA · SRT"
          data={subs}
          onPick={onPickSubs}
        />
        <Stage
          n="参"
          kanji="出"
          label="Output file"
          placeholder="Save location"
          data={out}
          ext="mp4"
          onPick={onPickOut}
        />
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onStart}
        disabled={!ready}
        className={cn(
          'group mt-1 flex h-[72px] items-center gap-3 rounded-md border px-4 text-left transition',
          ready
            ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-foreground hover:bg-[color-mix(in_oklab,var(--primary)_22%,transparent)]'
            : 'cursor-not-allowed border-border bg-card/40 text-muted opacity-70'
        )}
      >
        <span
          className={cn(
            'font-display text-4xl leading-none',
            ready ? 'text-primary' : 'text-muted/70'
          )}
        >
          斬
        </span>
        <span className="flex flex-1 flex-col">
          <span className="font-display text-lg leading-tight text-foreground">Begin encode</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            {ready ? 'all three · ready' : `${3 - filledCount} to go`}
          </span>
        </span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-sm border transition',
            ready
              ? 'border-primary/60 text-primary group-hover:translate-x-0.5'
              : 'border-border text-muted'
          )}
        >
          <IconPlay size={14} />
        </span>
      </button>

      {/* Spacer pushes rail stats down without fighting flex */}
      <div className="flex-1" />

      {/* Rail stats */}
      <div className="flex items-stretch gap-3 border-t border-border pt-4">
        <RailStat
          kanji="貯"
          value={freeBytesLabel ?? '—'}
          sublabel={freeBytesDisk ? `free · ${freeBytesDisk}` : 'free · —'}
        />
        <div className="w-px self-stretch bg-border" />
        <RailStat
          kanji="核"
          tone={gpu ? 'good' : 'default'}
          value={gpu?.label ?? '—'}
          sublabel={gpu?.detail ?? 'gpu · probing'}
        />
        <div className="w-px self-stretch bg-border" />
        <RailStat kanji="符" value="h264" sublabel="codec · nvenc" />
      </div>
    </aside>
  );
};
