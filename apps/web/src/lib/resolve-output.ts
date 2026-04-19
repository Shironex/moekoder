import type { SaveTarget } from '@moekoder/shared';

/**
 * Directory portion of a file path — accepts either `/` or `\` separators
 * so the same helper works against paths the user produced on Windows vs
 * macOS vs Linux. Returns `''` when the path is already a bare name.
 */
export const dirnameOf = (p: string): string => {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(0, idx) : '';
};

/**
 * Path separator inferred from the source path itself (`\` wins if present,
 * otherwise `/`). Lets us join a derived subfolder without dragging `path`
 * into the renderer bundle.
 */
export const sepFor = (p: string): string => (p.includes('\\') ? '\\' : '/');

/**
 * Resolve the default output directory for the onboarding save preference.
 *
 * Rules mirror the `SaveTarget` doc comment in `@moekoder/shared`:
 *   · `same`     → the video's own directory
 *   · `moekoder` → `<videoDir>/moekoder` (sibling subfolder)
 *   · `subbed`   → `customSavePath` if set, else `<videoDir>/subbed`
 *   · `custom`   → `customSavePath`; falls back to `<videoDir>` if unset
 *
 * The main-process orchestrator creates the directory recursively before
 * preflight, so the caller does not need to verify existence.
 */
export const resolveOutputDir = (
  saveTarget: SaveTarget,
  videoPath: string,
  customSavePath: string | null
): string => {
  const dir = dirnameOf(videoPath);
  const sep = sepFor(videoPath);
  switch (saveTarget) {
    case 'same':
      return dir;
    case 'moekoder':
      return `${dir}${sep}moekoder`;
    case 'subbed':
      return customSavePath ?? `${dir}${sep}subbed`;
    case 'custom':
      return customSavePath ?? dir;
  }
};
