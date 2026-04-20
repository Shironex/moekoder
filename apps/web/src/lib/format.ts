/**
 * Format helpers shared across the renderer. Kept here (not in @moekoder/shared)
 * because they're presentation concerns — the main process doesn't format
 * durations for display; it reports raw seconds and the renderer picks a
 * display style per screen.
 */

/**
 * Pretty-print a byte count into the largest binary unit that keeps the
 * numerator under 1024. Mirrors the precision shown in the Done summary
 * ("240 MB", "1.2 GB") — whole numbers above 100 in the unit, one decimal
 * below 100, and raw bytes when the unit is `B`.
 */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const decimals = v >= 100 || i === 0 ? 0 : 1;
  return `${v.toFixed(decimals)} ${units[i]}`;
};

/**
 * Fixed-unit MB formatter with one decimal — used by the download progress
 * rows in onboarding where the user is watching MB tick up against a known
 * total, so flipping units mid-progress would look janky.
 */
export const formatMB = (bytes: number | undefined): string => {
  if (!bytes || bytes <= 0) return '0.0';
  return (bytes / 1024 / 1024).toFixed(1);
};

/**
 * Format seconds as `m:ss` or `h:mm:ss`. Non-finite / negative input
 * collapses to `--:--` so ring / stat rows never show `NaN:NaN`.
 */
export const formatDuration = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) return '--:--';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
};

/**
 * Current wall-clock time as `HH:MM:SS` — used as a terminal-log prefix in
 * onboarding Engine where sub-second resolution would just be noise.
 */
export const formatClockTime = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

/**
 * Millisecond-precision timestamp `HH:MM:SS.mmm` — used by the live encode
 * log panel where stderr lines can arrive clustered inside a single second.
 */
export const formatTimestamp = (ms: number): string => {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms3 = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms3}`;
};
