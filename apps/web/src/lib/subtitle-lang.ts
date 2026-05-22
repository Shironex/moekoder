/**
 * Subtitle filename → language code derivation (v0.6.0, soft-sub mux).
 *
 * Fansub `.ass` files commonly encode their language in a secondary
 * extension: `Episode 01.en.ass`, `Episode 01.pl.ass`, `Episode 01.eng.ass`.
 * When the user enables "Mux only (soft subs)" we tag the muxed track with a
 * language so players label it. Matroska prefers ISO-639-2/B (`eng`, `pol`),
 * so we normalise any 2-letter (639-1) suffix we recognise up to its 3-letter
 * form and pass through anything already 3 letters.
 *
 * This is a best-effort convenience: the Settings field always lets the user
 * override. We deliberately keep the 639-1 → 639-2 table small (the languages
 * that actually show up in anime fansub releases) rather than shipping the
 * full ISO registry.
 */

/** ISO-639-1 (2-letter) → ISO-639-2/B (3-letter) for the common fansub set. */
const ISO_639_1_TO_2B: Record<string, string> = {
  en: 'eng',
  pl: 'pol',
  ja: 'jpn',
  jp: 'jpn',
  es: 'spa',
  fr: 'fre',
  de: 'ger',
  it: 'ita',
  pt: 'por',
  ru: 'rus',
  zh: 'chi',
  ko: 'kor',
  ar: 'ara',
  nl: 'dut',
  sv: 'swe',
  fi: 'fin',
  no: 'nor',
  da: 'dan',
  cs: 'cze',
  hu: 'hun',
  tr: 'tur',
  uk: 'ukr',
};

/**
 * Derive an ISO-639-2/B language code from a subtitle filename's secondary
 * extension. Returns `null` when the filename has no recognisable language
 * suffix so callers can leave the track untagged (or fall back to a manual
 * value).
 *
 *   "Ep 01.en.ass"  → "eng"
 *   "Ep 01.pol.ass" → "pol"
 *   "Ep 01.ass"     → null   (no language segment)
 *   "Ep 01.xx.ass"  → null   (unrecognised 2-letter code)
 */
export const deriveSubtitleLang = (subtitleFilename: string): string | null => {
  const name = subtitleFilename.split(/[\\/]/).pop() ?? subtitleFilename;
  // Split off the trailing subtitle extension, then inspect the next segment.
  const segments = name.split('.');
  // Need at least `base.lang.ext` — three dot-separated parts.
  if (segments.length < 3) return null;
  const candidate = segments[segments.length - 2]?.toLowerCase();
  if (!candidate) return null;

  if (candidate.length === 2) {
    return ISO_639_1_TO_2B[candidate] ?? null;
  }
  if (candidate.length === 3) {
    // Already a 3-letter code; accept it verbatim (alphabetic only).
    return /^[a-z]{3}$/.test(candidate) ? candidate : null;
  }
  return null;
};
