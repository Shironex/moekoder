import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Play, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useElectronAPI, useSetting } from '@/hooks';
import { logger } from '@/lib/logger';
import { formatBytes } from '@/lib/format';
import {
  CODEC_LABEL,
  HW_LABEL,
  presetFor,
  switchCodec,
  type Codec,
  type HwAccel,
} from '@/lib/encoding-profile';
import type {
  BenchmarkCandidate,
  BenchmarkCandidateResult,
  BenchmarkProgress,
} from '@/types/electron-api';
import type { EncodingProfile } from '@moekoder/shared';

const log = logger('benchmark');

interface BenchmarkModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Stage names for the per-candidate row. Mirror `BenchmarkProgress.phase`
 * with an additional `pending` state for candidates queued behind the
 * currently-running one.
 */
type RowPhase = 'pending' | 'encoding' | 'measuring-psnr' | 'done' | 'error';

const PHASE_LABEL: Record<RowPhase, string> = {
  pending: 'queued',
  encoding: 'encoding…',
  'measuring-psnr': 'computing PSNR…',
  done: 'done',
  error: 'failed',
};

/**
 * Build the default candidate set: Fast / Balanced / Pristine for the
 * user's currently-selected codec. The user picks files via the inputs
 * inside the modal; settings come from the per-codec preset constants
 * so the experiment is reproducible.
 */
const buildDefaultCandidates = (current: EncodingProfile | null): BenchmarkCandidate[] => {
  const codec = ((current?.codec as Codec | undefined) ?? 'h264') as Codec;
  const tiers: Array<{ tier: 'fast' | 'balanced' | 'pristine'; label: string }> = [
    { tier: 'fast', label: 'Fast' },
    { tier: 'balanced', label: 'Balanced' },
    { tier: 'pristine', label: 'Pristine' },
  ];
  return tiers.map(({ tier, label }) => {
    const profile = presetFor(codec, tier);
    return {
      id: `${codec}-${tier}`,
      label: `${CODEC_LABEL[codec]} ${label}`,
      settings: profile,
      container: (profile.container as 'mp4' | 'mkv' | undefined) ?? 'mp4',
    };
  });
};

/**
 * Modal-style benchmark UI. Picks 3 candidate profiles from the user's
 * current codec, encodes a 10s sample of the chosen video against each,
 * and renders the size / time / PSNR table.
 *
 * Lives as a sibling to the Encoding section; surfaced via a "Run
 * benchmark" button on that section. Doesn't reuse the encode-route IPC
 * stream — the orchestrator's encode events would otherwise mix the
 * benchmark progress into the main encode store.
 */
export const BenchmarkModal = ({ open, onClose }: BenchmarkModalProps) => {
  const api = useElectronAPI();
  const [encoding] = useSetting('encoding');

  const [video, setVideo] = useState<string | null>(null);
  const [subs, setSubs] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<BenchmarkCandidate[]>([]);
  const [results, setResults] = useState<BenchmarkCandidateResult[] | null>(null);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state every time the modal reopens.
  useEffect(() => {
    if (!open) return;
    setCandidates(buildDefaultCandidates(encoding ?? null));
    setResults(null);
    setProgress(null);
    setError(null);
  }, [open, encoding]);

  // Subscribe to progress events while the modal is mounted.
  useEffect(() => {
    if (!open) return;
    const offProgress = api.benchmark.onProgress(p => setProgress(p));
    return () => {
      try {
        offProgress();
      } catch (err) {
        log.warn('benchmark.onProgress unsubscribe failed', err);
      }
    };
  }, [api, open]);

  const onPickVideo = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({
        filters: [
          {
            name: 'Video',
            extensions: ['mkv', 'mp4', 'm4v', 'webm', 'avi', 'mov', 'ts', 'm2ts'],
          },
        ],
      });
      if (res.canceled || !res.filePath) return;
      setVideo(res.filePath);
    } catch (err) {
      log.warn('benchmark video pick failed', err);
    }
  }, [api]);

  const onPickSubs = useCallback(async (): Promise<void> => {
    try {
      const res = await api.dialog.openFile({
        filters: [{ name: 'Subtitle', extensions: ['ass', 'ssa', 'srt', 'vtt'] }],
      });
      if (res.canceled || !res.filePath) return;
      setSubs(res.filePath);
    } catch (err) {
      log.warn('benchmark subs pick failed', err);
    }
  }, [api]);

  const canRun = Boolean(video && subs && candidates.length > 0 && !running);

  const onRun = useCallback(async (): Promise<void> => {
    if (!video || !subs) return;
    setRunning(true);
    setResults(null);
    setError(null);
    try {
      const out = await api.benchmark.run({
        videoPath: video,
        subtitlePath: subs,
        candidates,
      });
      setResults(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('benchmark run failed', err);
      setError(message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [api, video, subs, candidates]);

  const onCycleCandidateCodec = useCallback((index: number, nextCodec: Codec): void => {
    setCandidates(prev => {
      const next = [...prev];
      const slot = next[index];
      if (!slot) return prev;
      const swapped = switchCodec(slot.settings as EncodingProfile, nextCodec, []);
      next[index] = {
        ...slot,
        label: `${CODEC_LABEL[nextCodec]} ${slot.label.split(' ').slice(-1)[0]}`,
        settings: swapped,
        container: (swapped.container as 'mp4' | 'mkv' | undefined) ?? 'mp4',
      };
      return next;
    });
  }, []);

  const rowPhase = useCallback(
    (index: number, results: BenchmarkCandidateResult[] | null): RowPhase => {
      if (results) {
        const r = results[index];
        if (!r) return 'pending';
        if (r.error) return 'error';
        return 'done';
      }
      if (!progress) return 'pending';
      if (progress.candidateIndex < index) return 'pending';
      if (progress.candidateIndex > index) return 'done';
      return progress.phase as RowPhase;
    },
    [progress]
  );

  const candidateRows = useMemo(() => {
    return candidates.map((c, i) => {
      const phase = rowPhase(i, results);
      const result = results?.[i] ?? null;
      const codec = ((c.settings.codec as Codec | undefined) ?? 'h264') as Codec;
      const hw = ((c.settings.hwAccel as HwAccel | undefined) ?? 'nvenc') as HwAccel;
      return { c, i, phase, result, codec, hw };
    });
  }, [candidates, results, rowPhase]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Benchmark"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[min(900px,92vw)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-popover/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-display text-3xl leading-none text-primary">試</span>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                benchmark · 試 · shi
              </span>
              <h2 className="font-display text-xl text-foreground">Benchmark candidates</h2>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
            <X size={14} />
            Close
          </Button>
        </header>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <p className="text-sm text-muted-foreground">
            Encodes a 10-second sample of the chosen video against each candidate, then measures
            output size, encode time, and PSNR. Pick a representative scene — solid colour
            transitions or fast motion expose differences best.
          </p>

          {/* File pickers */}
          <div className="flex flex-col gap-3">
            <FilePickRow label="Video" value={video} onPick={onPickVideo} />
            <FilePickRow label="Subtitles" value={subs} onPick={onPickSubs} />
          </div>

          {/* Candidate codec quick-switches */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              candidates
            </span>
            <ul className="flex flex-col gap-2">
              {candidateRows.map(({ c, i, phase, result, codec, hw }) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3"
                >
                  <div className="flex min-w-[180px] flex-col gap-1">
                    <span className="font-display text-sm text-foreground">{c.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {CODEC_LABEL[codec]} · {HW_LABEL[hw]} · CQ {String(c.settings.cq ?? '?')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CodecCycle codec={codec} onChange={next => onCycleCandidateCodec(i, next)} />
                    <RowStatus phase={phase} result={result} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Run button */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onRun} disabled={!canRun}>
              <Play size={14} />
              {running ? 'Running…' : 'Run benchmark'}
            </Button>
            {progress && running && (
              <span className="font-mono text-[11px] text-muted">
                Candidate {progress.candidateIndex + 1} of {candidates.length} ·{' '}
                {PHASE_LABEL[progress.phase as RowPhase]}
              </span>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 font-mono text-[12px] text-bad">
              {error}
            </div>
          )}

          {/* Results table */}
          {results && (
            <div className="overflow-x-auto rounded-lg border border-border bg-popover/30">
              <table className="w-full font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-border text-left uppercase tracking-[0.18em] text-muted">
                    <th className="px-4 py-2">Candidate</th>
                    <th className="px-4 py-2 text-right">Size</th>
                    <th className="px-4 py-2 text-right">Time</th>
                    <th className="px-4 py-2 text-right">PSNR</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-2 text-foreground">
                        {r.label}
                        {r.error && <span className="ml-2 text-[11px] text-bad">{r.error}</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-foreground">
                        {r.sizeBytes !== null ? formatBytes(r.sizeBytes) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-foreground">
                        {r.elapsedMs !== null ? `${(r.elapsedMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-foreground">
                        {r.psnr !== null ? `${r.psnr.toFixed(2)} dB` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface FilePickRowProps {
  label: string;
  value: string | null;
  onPick: () => void;
}

const FilePickRow = ({ label, value, onPick }: FilePickRowProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
    <div className="flex min-w-[120px] flex-col gap-1">
      <span className="font-display text-sm text-foreground">{label}</span>
      <span className="truncate font-mono text-[11px] text-muted-foreground">
        {value ?? 'not picked'}
      </span>
    </div>
    <Button variant="ghost" size="sm" onClick={onPick}>
      <Activity size={14} />
      {value ? 'Change' : 'Pick'}
    </Button>
  </div>
);

interface CodecCycleProps {
  codec: Codec;
  onChange: (next: Codec) => void;
}

/**
 * Tiny inline codec cycler — the user can promote a candidate from
 * H.264 → HEVC → AV1 to compare across codecs without leaving the modal.
 */
const CodecCycle = ({ codec, onChange }: CodecCycleProps) => {
  const order: Codec[] = ['h264', 'hevc', 'av1'];
  const next = order[(order.indexOf(codec) + 1) % order.length]!;
  return (
    <Button variant="ghost" size="sm" onClick={() => onChange(next)}>
      → {CODEC_LABEL[next].split(' ')[0]}
    </Button>
  );
};

interface RowStatusProps {
  phase: RowPhase;
  result: BenchmarkCandidateResult | null;
}

const RowStatus = ({ phase, result }: RowStatusProps) => {
  if (phase === 'done' && result) {
    return (
      <span className="font-mono text-[11px] text-good">
        {result.sizeBytes !== null ? formatBytes(result.sizeBytes) : '—'} ·{' '}
        {result.psnr !== null ? `${result.psnr.toFixed(1)} dB` : '—'}
      </span>
    );
  }
  if (phase === 'error') {
    return <span className="font-mono text-[11px] text-bad">{PHASE_LABEL[phase]}</span>;
  }
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
      {PHASE_LABEL[phase]}
    </span>
  );
};
