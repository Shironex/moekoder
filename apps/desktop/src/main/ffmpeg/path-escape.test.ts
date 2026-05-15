import { describe, it, expect } from 'vitest';
import { escapeLibassPathFor, escapeSubtitlePathFor } from './path-escape';

/**
 * Exact-output assertions freeze the escape behaviour — the outputs here
 * were captured from the original AG-Wypalarka escape implementation, which
 * is the reference implementation we're porting. Any drift in these strings
 * means we've regressed the hard-won path-through-three-parsers contract.
 */
describe('escapeLibassPathFor (win32)', () => {
  it('escapes a typical Windows path: drive letter + backslashes', () => {
    expect(escapeLibassPathFor('C:\\anime\\Show - 01.ass', 'win32')).toBe(
      'C\\:\\\\\\\\anime\\\\\\\\Show - 01.ass'
    );
  });

  it('escapes spaces + parentheses (parens pass through untouched)', () => {
    expect(escapeLibassPathFor('C:\\a folder\\with (parens)\\sub.ass', 'win32')).toBe(
      'C\\:\\\\\\\\a folder\\\\\\\\with (parens)\\\\\\\\sub.ass'
    );
  });

  it('escapes filter-graph specials: quotes, brackets, semis, commas, equals', () => {
    expect(escapeLibassPathFor("C:\\dir\\what's[happening];ok,now=eq.ass", 'win32')).toBe(
      "C\\:\\\\\\\\dir\\\\\\\\what\\'s\\[happening\\]\\;ok\\,now\\=eq.ass"
    );
  });

  it('is idempotent only once — re-escaping a pre-escaped path corrupts it', () => {
    // Not an assertion of a desirable behaviour — just a guardrail: callers
    // must never feed the output back through. The double-escape below
    // produces garbage which is exactly why we freeze it here.
    const once = escapeLibassPathFor('C:\\a\\b.ass', 'win32');
    const twice = escapeLibassPathFor(once, 'win32');
    expect(twice).not.toBe(once);
  });
});

describe('escapeLibassPathFor (posix)', () => {
  it('leaves a typical POSIX path untouched', () => {
    expect(escapeLibassPathFor('/home/user/anime/show.ass', 'posix')).toBe(
      '/home/user/anime/show.ass'
    );
  });

  it('escapes a colon inside a filename (filter-graph separator)', () => {
    expect(escapeLibassPathFor('/anime/Episode 01: Pilot.ass', 'posix')).toBe(
      '/anime/Episode 01\\: Pilot.ass'
    );
  });

  it("escapes single quotes (string delimiter for subtitles='<path>')", () => {
    expect(escapeLibassPathFor("/anime/it's fine.ass", 'posix')).toBe("/anime/it\\'s fine.ass");
  });

  it('escapes filter-graph specials on POSIX too', () => {
    expect(escapeLibassPathFor('/a/b[c];d,e=f.ass', 'posix')).toBe('/a/b\\[c\\]\\;d\\,e\\=f.ass');
  });

  it('does not double-escape forward slashes', () => {
    expect(escapeLibassPathFor('/a/b/c.ass', 'posix')).toBe('/a/b/c.ass');
  });
});

describe('escapeLibassPathFor — fontsdir inputs (v0.5.0)', () => {
  it('escapes a Windows temp fontsdir path with the same 3-layer chain', () => {
    // `fontsdir=` is a colon-separated option to the same libass filter,
    // so the escape rules are identical to the `subtitles=` path.
    expect(escapeLibassPathFor('C:\\Users\\u\\AppData\\Local\\Temp\\mkfont-abc123', 'win32')).toBe(
      'C\\:\\\\\\\\Users\\\\\\\\u\\\\\\\\AppData\\\\\\\\Local\\\\\\\\Temp\\\\\\\\mkfont-abc123'
    );
  });

  it('escapes a POSIX temp fontsdir path (trailing slash preserved)', () => {
    expect(escapeLibassPathFor('/tmp/mkfont-abc123', 'posix')).toBe('/tmp/mkfont-abc123');
  });
});

describe('escapeSubtitlePathFor — deprecated alias', () => {
  it('is the same reference as escapeLibassPathFor', () => {
    expect(escapeSubtitlePathFor).toBe(escapeLibassPathFor);
  });
});
