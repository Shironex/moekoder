/**
 * FFmpeg Subtitle Filter Path Escaping
 * =====================================
 *
 * The subtitles filter in FFmpeg requires careful path escaping due to
 * multiple parsing layers:
 *
 * Layer 1: FFmpeg option parser
 *   -vf "subtitles='C:\\path\\file.ass'"
 *   The outer quotes protect the entire filter string
 *
 * Layer 2: Filter graph parser
 *   Parses: subtitles='C:\\path\\file.ass'
 *   Special chars: [ ] ; , = ' need escaping with backslash
 *
 * Layer 3: Subtitles filter (libass)
 *   Receives: C:\path\file.ass (after unescaping)
 *   On Windows, backslashes are path separators
 *
 * Escaping chain for backslash on Windows:
 *   Original file:     C:\path\file.ass
 *   In JS string:      "C:\\path\\file.ass" (2 backslashes)
 *   Escaped for FFmpeg: "C\\\\:\\\\path\\\\file.ass" (4 backslashes)
 *   After filter parse: C\\path\\file.ass (2 backslashes)
 *   After libass parse: C:\path\file.ass (1 backslash - correct!)
 */

/**
 * Escapes a file path for use in FFmpeg's `subtitles=` filter.
 *
 * Windows branch: runs the 3-layer backslash / drive-letter / filter-graph
 * escape chain documented above.
 *
 * POSIX branch: drive letters don't exist and path separators are forward
 * slashes (no backslash escaping needed). The only character we still have
 * to escape is `:`, which the filter-graph parser treats as a separator
 * between the filter name and its options — a colon inside the subtitle
 * path would otherwise split the filter expression. Filter-graph specials
 * (`[ ] ; , = '`) are escaped on both platforms because they can legally
 * appear in filenames.
 *
 * @param absolutePath - The absolute path to the subtitle file
 * @returns Escaped path safe for use inside `subtitles='<path>'`
 */
export const escapeSubtitlePath = (absolutePath: string): string => {
  if (process.platform === 'win32') {
    return (
      absolutePath
        // Step 1: Escape backslashes first (must be done before other escapes)
        // Windows paths need 4 backslashes due to double unescaping by FFmpeg + libass
        .replace(/\\/g, '\\\\\\\\')
        // Step 2: Escape colons (Windows drive letters like C:)
        .replace(/:/g, '\\:')
        // Step 3: Escape single quotes (string delimiters)
        .replace(/'/g, "\\'")
        // Step 4: Escape filter graph special characters
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/=/g, '\\=')
    );
  }

  return (
    absolutePath
      // POSIX: colon is the sole path character that conflicts with the
      // filter-graph parser; forward slashes pass through untouched.
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'")
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/=/g, '\\=')
  );
};
