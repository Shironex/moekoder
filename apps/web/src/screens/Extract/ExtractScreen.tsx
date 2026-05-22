import { ArrowLeft, CheckCircle2, FileVideo, FolderOpen, Subtitles, XCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { useSubtitleExtract } from '@/hooks';
import { useAppStore } from '@/stores';
import { cn } from '@/lib/cn';
import { imageSubtitleHint, type SubtitleOutputFormat } from '@/lib/subtitle-export';
import type { ExtractTrack, TrackResult } from '@/hooks';

/** Compact codec/language label, falling back gracefully on missing tags. */
const langLabel = (track: ExtractTrack): string => track.language ?? (track.title ? '' : '—');

/** Output-format options for the segmented selector. ASS leads (the default). */
const FORMAT_OPTIONS: ReadonlyArray<{ value: SubtitleOutputFormat; label: string }> = [
  { value: 'ass', label: 'ASS' },
  { value: 'srt', label: 'SRT' },
  { value: 'source', label: 'Match source' },
];

/**
 * Dedicated subtitle-extraction screen (v0.6.0). The inverse of soft-sub
 * muxing: open a container, probe its embedded subtitle streams, multi-select
 * the text tracks, and stream-copy them out to standalone `.ass` / `.srt`
 * files. Image-based tracks (PGS/VOBSUB) are shown but disabled — they have
 * no text representation.
 *
 * Reached from the Titlebar "Extract" entry, which flips `activeView` to
 * `'extract'`. Listing reuses `ffmpeg.probe`; extraction goes through the
 * `subtitle:extract` IPC channel.
 */
export const ExtractScreen = () => {
  const setView = useAppStore(s => s.setView);
  const {
    source,
    tracks,
    selected,
    outputDir,
    format,
    probing,
    phase,
    results,
    error,
    pickSource,
    pickOutputDir,
    toggleTrack,
    toggleAll,
    setFormat,
    extract,
    reset,
  } = useSubtitleExtract();

  const selectableCount = tracks.filter(t => t.selectable).length;
  const allSelected = selectableCount > 0 && selected.size === selectableCount;
  const canExtract =
    Boolean(source) && Boolean(outputDir) && selected.size > 0 && phase !== 'extracting';

  // Warn only when SRT is chosen AND a selected source is ASS/SSA — that's the
  // lossy direction (override tags + positioning are dropped on convert).
  const srtDropsStyling =
    format === 'srt' &&
    tracks.some(t => selected.has(t.ordinal) && (t.codec === 'ass' || t.codec === 'ssa'));

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient watermark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -bottom-24 select-none font-display text-[520px] leading-none text-primary/[0.05]"
      >
        抽
      </span>

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center gap-4 border-b border-border bg-popover/40 px-10 py-5 backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setView('single-idle');
          }}
        >
          <ArrowLeft size={14} />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="font-display text-3xl leading-none text-primary">抽</span>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              extract · 抽出 · chūshutsu
            </span>
            <h1 className="font-display text-xl text-foreground">Extract subtitles</h1>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-10 py-8">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6">
          {/* Source picker */}
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/30 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                  source · 元 · moto
                </span>
                <h2 className="font-display text-lg text-foreground">Source file</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={pickSource} disabled={probing}>
                <FileVideo size={14} />
                {source ? 'Choose another' : 'Browse'}
              </Button>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3 font-mono text-[12px]">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  probing ? 'bg-primary' : source ? 'bg-good' : 'bg-muted'
                )}
                aria-hidden="true"
              />
              <span className="truncate text-foreground">
                {probing ? 'probing…' : (source?.name ?? 'No file selected')}
              </span>
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-[12px] text-foreground"
              >
                {error}
              </p>
            )}
          </section>

          {/* Subtitle-track table */}
          {source && !probing && (
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/30 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                    tracks · 字幕 · jimaku
                  </span>
                  <h2 className="font-display text-lg text-foreground">Embedded subtitle tracks</h2>
                </div>
                {selectableCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={toggleAll}>
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </Button>
                )}
              </div>

              {tracks.length === 0 ? (
                <p className="rounded-lg border border-border bg-popover/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  No subtitle tracks found in this file.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-popover/40 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                        <th className="w-10 px-3 py-2" scope="col">
                          <span className="sr-only">Select</span>
                        </th>
                        <th className="w-14 px-3 py-2" scope="col">
                          #
                        </th>
                        <th className="px-3 py-2" scope="col">
                          Codec
                        </th>
                        <th className="px-3 py-2" scope="col">
                          Lang
                        </th>
                        <th className="px-3 py-2" scope="col">
                          Title
                        </th>
                        <th className="px-3 py-2 text-right" scope="col">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tracks.map(track => (
                        <TrackRow
                          key={track.ordinal}
                          track={track}
                          checked={selected.has(track.ordinal)}
                          result={results.get(track.ordinal)}
                          onToggle={() => toggleTrack(track.ordinal)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Output dir + action */}
          {source && !probing && tracks.length > 0 && (
            <section className="flex flex-col gap-4 rounded-xl border border-border bg-card/30 p-6">
              {/* Output format selector — applies to every extracted track. */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                    format · 形式 · keishiki
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    Output format for the extracted subtitles
                  </span>
                </div>
                <div
                  className="flex overflow-hidden rounded-md border border-border"
                  role="group"
                  aria-label="Output format"
                >
                  {FORMAT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormat(opt.value)}
                      aria-pressed={format === opt.value}
                      className={cn(
                        'px-3 py-1.5 font-mono text-[11px] transition-colors',
                        format === opt.value
                          ? 'bg-primary text-background'
                          : 'text-muted hover:bg-popover/40'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {srtDropsStyling && (
                <p className="rounded-md border border-border/60 bg-popover/30 px-3 py-2 text-[12px] text-muted-foreground">
                  Converting ASS → SRT drops styling, positioning, and override tags. Choose{' '}
                  <span className="text-foreground">ASS</span> or{' '}
                  <span className="text-foreground">Match source</span> to keep them.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                    output · 先 · saki
                  </span>
                  <span className="truncate font-mono text-[12px] text-foreground">
                    {outputDir ?? 'No folder selected'}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={pickOutputDir}>
                  <FolderOpen size={14} />
                  Output folder
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                <span className="font-mono text-[11px] text-muted">
                  {selected.size} selected
                  {phase === 'done' && ' · done'}
                </span>
                <Button variant="primary" size="sm" onClick={extract} disabled={!canExtract}>
                  <Subtitles size={14} />
                  {phase === 'extracting' ? 'Extracting…' : 'Extract selected'}
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
};

interface TrackRowProps {
  track: ExtractTrack;
  checked: boolean;
  result: TrackResult | undefined;
  onToggle: () => void;
}

const TrackRow = ({ track, checked, result, onToggle }: TrackRowProps) => {
  const hint = imageSubtitleHint(track.codec);
  return (
    <tr
      className={cn(
        'border-b border-border/50 last:border-b-0',
        track.selectable ? 'hover:bg-popover/30' : 'opacity-55'
      )}
      title={hint ?? undefined}
    >
      <td className="px-3 py-2 align-middle">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary disabled:cursor-not-allowed"
          checked={checked}
          disabled={!track.selectable}
          onChange={onToggle}
          aria-label={`Select subtitle track ${track.ordinal}`}
        />
      </td>
      <td className="px-3 py-2 align-middle font-mono text-[12px] text-muted">
        {track.absoluteIndex}
      </td>
      <td className="px-3 py-2 align-middle font-mono text-[12px] text-foreground">
        {track.codec}
        {!track.selectable && (
          <span className="ml-2 rounded-sm bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
            image
          </span>
        )}
      </td>
      <td className="px-3 py-2 align-middle font-mono text-[12px] text-foreground">
        {langLabel(track)}
      </td>
      <td className="max-w-[220px] truncate px-3 py-2 align-middle text-[12px] text-muted-foreground">
        {track.title ?? hint ?? '—'}
      </td>
      <td className="px-3 py-2 text-right align-middle">
        {result?.kind === 'ok' && (
          <span className="inline-flex items-center gap-1 text-[12px] text-good">
            <CheckCircle2 size={14} />
            saved
          </span>
        )}
        {result?.kind === 'error' && (
          <span
            className="inline-flex items-center gap-1 text-[12px] text-bad"
            title={result.message}
          >
            <XCircle size={14} />
            failed
          </span>
        )}
      </td>
    </tr>
  );
};
