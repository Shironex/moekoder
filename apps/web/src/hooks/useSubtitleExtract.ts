import { useCallback, useMemo, useState } from 'react';
import { useElectronAPI } from './useElectronAPI';
import { basename, joinPath, stripExt } from '@/lib/paths';
import { dirnameOf } from '@/lib/resolve-output';
import {
  extensionForSubtitleCodec,
  isTextSubtitleCodec,
  outputExtForFormat,
  type SubtitleOutputFormat,
} from '@/lib/subtitle-export';
import { deriveSubtitleLang } from '@/lib/subtitle-lang';
import { logger } from '@/lib/logger';
import type { ProbeResult, ProbeSubtitleStream } from '@/types/electron-api';

const log = logger('subtitle-extract');

/** `Electron.FileFilter`-shaped list for the source-container open dialog. */
const CONTAINER_DIALOG_FILTERS = [
  { name: 'Matroska / video', extensions: ['mkv', 'mp4', 'm4v', 'webm', 'mov', 'ts', 'm2ts'] },
  { name: 'All files', extensions: ['*'] },
];

/** Per-track row the Extract screen renders. */
export interface ExtractTrack {
  /** Subtitle ordinal among subtitle streams (0-based) — maps to `0:s:<N>`. */
  ordinal: number;
  /** Absolute ffprobe stream index (informational; shown in the table). */
  absoluteIndex: number;
  codec: string;
  language?: string;
  title?: string;
  /** Whether this track is a text subtitle (extractable to .ass/.srt). */
  selectable: boolean;
  /** Output extension a `-c:s copy` of this codec produces (null if image). */
  outputExt: string | null;
}

/** One row's terminal state after an extract run. */
export type TrackResult = { kind: 'ok'; outputPath: string } | { kind: 'error'; message: string };

type Phase = 'idle' | 'extracting' | 'done';

interface UseSubtitleExtract {
  source: { name: string; path: string } | null;
  tracks: ExtractTrack[];
  /** Selected ordinals (text tracks only). */
  selected: Set<number>;
  outputDir: string | null;
  /** Chosen output format applied to every extracted track. */
  format: SubtitleOutputFormat;
  probing: boolean;
  phase: Phase;
  /** Per-ordinal terminal result after the last run. */
  results: Map<number, TrackResult>;
  /** Probe error surfaced to the screen, or null. */
  error: string | null;
  pickSource: () => Promise<void>;
  pickOutputDir: () => Promise<void>;
  toggleTrack: (ordinal: number) => void;
  toggleAll: () => void;
  setFormat: (format: SubtitleOutputFormat) => void;
  extract: () => Promise<void>;
  reset: () => void;
}

/**
 * Orchestrates the Extract flow: pick a source container, probe it for
 * embedded subtitle streams, let the user multi-select the *text* tracks,
 * choose an output dir, and extract each selected track via `-c:s copy`.
 *
 * Image subtitle tracks (PGS/VOBSUB) are surfaced but non-selectable — they
 * have no `.ass`/`.srt` representation.
 */
export const useSubtitleExtract = (): UseSubtitleExtract => {
  const api = useElectronAPI();
  const [source, setSource] = useState<{ name: string; path: string } | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [outputDir, setOutputDir] = useState<string | null>(null);
  // Default to ASS — anime subtitles are authored in ASS and it's the format
  // users most often want; SubRip sources are transcoded up to it.
  const [format, setFormat] = useState<SubtitleOutputFormat>('ass');
  const [probing, setProbing] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<Map<number, TrackResult>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const tracks = useMemo<ExtractTrack[]>(() => {
    const streams = probe?.subtitleStreams ?? [];
    return streams.map((s: ProbeSubtitleStream, ordinal: number) => {
      const selectable = isTextSubtitleCodec(s.codec);
      return {
        ordinal,
        absoluteIndex: s.index,
        codec: s.codec,
        language: s.language,
        title: s.title,
        selectable,
        outputExt: extensionForSubtitleCodec(s.codec),
      };
    });
  }, [probe]);

  const selectableOrdinals = useMemo(
    () => tracks.filter(t => t.selectable).map(t => t.ordinal),
    [tracks]
  );

  const probeSource = useCallback(
    async (filePath: string): Promise<void> => {
      setProbing(true);
      setError(null);
      setProbe(null);
      setSelected(new Set());
      setResults(new Map());
      setPhase('idle');
      try {
        const result = await api.ffmpeg.probe(filePath);
        setProbe(result);
        // Pre-select every text track — the common case is "extract them all".
        const preselect = result.subtitleStreams
          .map((s, i) => (isTextSubtitleCodec(s.codec) ? i : -1))
          .filter(i => i >= 0);
        setSelected(new Set(preselect));
        // Default the output dir to the source's folder until the user picks.
        const dir = dirnameOf(filePath);
        if (dir) setOutputDir(dir);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('probe failed', err);
        setError(message);
      } finally {
        setProbing(false);
      }
    },
    [api]
  );

  const pickSource = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({ filters: CONTAINER_DIALOG_FILTERS });
      if (res.canceled || !res.filePath) return;
      setSource({ name: basename(res.filePath), path: res.filePath });
      await probeSource(res.filePath);
    } catch (err) {
      log.error('dialog.openFile (source) failed', err);
    }
  }, [api, probeSource]);

  const pickOutputDir = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFolder({});
      if (res.canceled || !res.folderPath) return;
      setOutputDir(res.folderPath);
    } catch (err) {
      log.error('dialog.openFolder failed', err);
    }
  }, [api]);

  const toggleTrack = useCallback(
    (ordinal: number): void => {
      const track = tracks.find(t => t.ordinal === ordinal);
      if (!track?.selectable) return;
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(ordinal)) next.delete(ordinal);
        else next.add(ordinal);
        return next;
      });
    },
    [tracks]
  );

  const toggleAll = useCallback((): void => {
    setSelected(prev =>
      prev.size === selectableOrdinals.length ? new Set() : new Set(selectableOrdinals)
    );
  }, [selectableOrdinals]);

  const extract = useCallback(async (): Promise<void> => {
    if (!source || !outputDir || selected.size === 0 || phase === 'extracting') return;
    setPhase('extracting');
    const runResults = new Map<number, TrackResult>();
    const sourceStem = stripExt(source.name);

    // Extract sequentially — each is fast (text streams are tiny) and a serial
    // loop keeps the per-track result mapping simple + the ffmpeg spawns light.
    for (const track of tracks) {
      if (!selected.has(track.ordinal) || !track.selectable) continue;
      // Extension follows the chosen format (transcoded if it differs from the
      // source codec); fall back to the source ext, then `.ass`.
      const ext = outputExtForFormat(track.codec, format) ?? track.outputExt ?? 'ass';
      // Disambiguate multiple tracks with a language/index suffix so a
      // multi-sub extract doesn't overwrite a single output file.
      const langTag = track.language ?? deriveSubtitleLang(source.name) ?? `t${track.ordinal}`;
      const filename = `${sourceStem}.${langTag}.${ext}`;
      const outputPath = joinPath(outputDir, filename);
      try {
        const res = await api.subtitle.extract({
          videoPath: source.path,
          streamIndex: track.ordinal,
          codec: track.codec,
          format,
          outputPath,
        });
        runResults.set(track.ordinal, { kind: 'ok', outputPath: res.outputPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`extract track ${track.ordinal} failed`, err);
        runResults.set(track.ordinal, { kind: 'error', message });
      }
    }

    setResults(runResults);
    setPhase('done');
  }, [api, source, outputDir, selected, tracks, phase, format]);

  const reset = useCallback((): void => {
    setSource(null);
    setProbe(null);
    setSelected(new Set());
    setOutputDir(null);
    setFormat('ass');
    setProbing(false);
    setPhase('idle');
    setResults(new Map());
    setError(null);
  }, []);

  return {
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
  };
};
