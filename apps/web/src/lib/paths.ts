/**
 * Tiny path helpers that work from both `/` and `\` separators so the
 * renderer doesn't need to import Node's `path` module (not available in
 * browser contexts) or know the host OS up-front. Inferring the separator
 * from the input keeps Windows and POSIX output consistent with whatever
 * the main process handed us.
 */

/**
 * Extract a trailing filename from a path, splitting on both `/` and `\`.
 * Falls back to the input when no separator is present so empty strings and
 * bare filenames survive round-trip.
 */
export const basename = (p: string): string => {
  const segs = p.split(/[\\/]/);
  return segs[segs.length - 1] || p;
};

/**
 * Extension (without the leading dot), lowercased. Returns `undefined` when
 * the filename has no extension or ends with a dot.
 */
export const extOf = (p: string): string | undefined => {
  const name = basename(p);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
};

/**
 * Strip the extension from a filename. Used to compose a default output
 * filename from the video source.
 */
export const stripExt = (name: string): string => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  return name.slice(0, dot);
};

/**
 * Join a directory and filename with the separator used by the directory
 * itself — so a Windows path stays backslashed and a POSIX path stays
 * forward-slashed without needing a platform flag.
 */
export const joinPath = (dir: string, file: string): string => {
  if (!dir) return file;
  const sep = dir.includes('\\') ? '\\' : '/';
  const trimmed = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir;
  return `${trimmed}${sep}${file}`;
};
