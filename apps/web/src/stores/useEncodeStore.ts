import { create } from 'zustand';

export type EncodePhase = 'idle' | 'running' | 'paused' | 'done' | 'error';

export type EncodeLogLevel = 'info' | 'warn' | 'error' | 'trace';

export interface EncodeLogLine {
  ts: number;
  level: EncodeLogLevel;
  text: string;
}

export interface EncodeProgress {
  pct: number;
  fps: number;
  bitrateKbps: number;
  speed: number;
  outTimeSec: number;
  etaSec: number;
}

export interface EncodeResultSummary {
  file: string;
  durationSec: number;
  bytes: number;
  avgFps: number;
}

export interface EncodeErrorSummary {
  code: string;
  message: string;
}

interface EncodeState {
  phase: EncodePhase;
  jobId: string | null;
  progress: EncodeProgress;
  logs: EncodeLogLine[];
  result: EncodeResultSummary | null;
  error: EncodeErrorSummary | null;
  setPhase: (phase: EncodePhase) => void;
  setJobId: (id: string | null) => void;
  setProgress: (p: Partial<EncodeProgress>) => void;
  appendLog: (line: EncodeLogLine) => void;
  clearLogs: () => void;
  setResult: (r: EncodeResultSummary | null) => void;
  setError: (e: EncodeErrorSummary | null) => void;
  reset: () => void;
}

const INITIAL_PROGRESS: EncodeProgress = {
  pct: 0,
  fps: 0,
  bitrateKbps: 0,
  speed: 0,
  outTimeSec: 0,
  etaSec: 0,
};

/**
 * Cap the log buffer so a long-running encode can't exhaust renderer memory.
 * FFmpeg emits a line roughly every ~0.5s; 500 lines ~ 4 minutes of trailing
 * history, plenty for a live panel.
 */
const MAX_LOG_LINES = 500;

export const useEncodeStore = create<EncodeState>(set => ({
  phase: 'idle',
  jobId: null,
  progress: INITIAL_PROGRESS,
  logs: [],
  result: null,
  error: null,
  setPhase: phase => set({ phase }),
  setJobId: jobId => set({ jobId }),
  setProgress: p => set(s => ({ progress: { ...s.progress, ...p } })),
  appendLog: line => set(s => ({ logs: [...s.logs, line].slice(-MAX_LOG_LINES) })),
  clearLogs: () => set({ logs: [] }),
  setResult: result => set({ result }),
  setError: error => set({ error }),
  reset: () =>
    set({
      phase: 'idle',
      jobId: null,
      progress: INITIAL_PROGRESS,
      logs: [],
      result: null,
      error: null,
    }),
}));
