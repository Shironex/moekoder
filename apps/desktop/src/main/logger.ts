import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger, type Logger, type LoggerOptions } from '@moekoder/shared';

const LOG_FILE_PREFIX = 'moekoder';
const LOG_FILE_EXT = '.log';
/** How long to keep daily log files before deleting. */
const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let logsDir: string | null = null;
let fileLoggingFailed = false;
let failureNotified = false;

/**
 * Ensures the `<userData>/logs` directory exists and returns its path.
 * The directory is created lazily on first write so logging never blocks
 * during module evaluation (the app may not be `ready` yet when this file
 * is first imported).
 */
export function getLogsDir(): string {
  if (!logsDir) {
    const userDataPath = app.getPath('userData');
    logsDir = path.join(userDataPath, 'logs');
  }
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

function todayLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(getLogsDir(), `${LOG_FILE_PREFIX}-${date}${LOG_FILE_EXT}`);
}

function notifyFailure(err: unknown): void {
  if (!failureNotified) {
    failureNotified = true;

    console.error('[logger] file transport failed, suppressing further writes:', err);
  }
  fileLoggingFailed = true;
}

/**
 * Appends a preformatted JSON log line to the current day's log file.
 * All errors are swallowed after one notification so console/IPC logging
 * never crashes the main process.
 */
const fileTransport = (message: string): void => {
  if (fileLoggingFailed) return;
  try {
    fs.appendFileSync(todayLogPath(), message);
  } catch (err) {
    notifyFailure(err);
  }
};

/**
 * Deletes log files older than `LOG_MAX_AGE_MS` on app startup. Swallows all
 * errors — cleanup is opportunistic and must never block boot.
 */
export function cleanupOldLogs(): void {
  let dir: string;
  try {
    dir = getLogsDir();
  } catch {
    return;
  }
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - LOG_MAX_AGE_MS;
  for (const file of files) {
    if (!file.startsWith(LOG_FILE_PREFIX) || !file.endsWith(LOG_FILE_EXT)) continue;
    const full = path.join(dir, file);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
      }
    } catch {
      /* ignore individual file errors */
    }
  }
}

const loggerOptions: LoggerOptions = { fileTransport };

/** Default main-process logger with file transport. */
export const log: Logger = createLogger('main', loggerOptions);

/** Factory for feature-scoped loggers that share the same file transport. */
export function createMainLogger(context: string): Logger {
  return createLogger(context, loggerOptions);
}
