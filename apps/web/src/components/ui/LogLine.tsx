import { Fragment } from 'react';

export type LogLevel = 'info' | 'warn' | 'error' | 'trace' | 'ok';

interface LogLineProps {
  /** Preformatted timestamp string (e.g. "12:04:07.214"). */
  ts: string;
  /** Severity — drives the `.log-lvl.<lvl>` color token. */
  lvl: LogLevel;
  /** Raw log text. Syntax-highlighted at render time. */
  text: string;
}

type TokenKind = 't' | 'key' | 'num' | 'time' | 'str' | 'file';
interface Token {
  k: TokenKind;
  v: string;
}

/**
 * FFmpeg log token matcher. Order of branches inside the regex matters —
 * key=value must beat the raw-number match, time must beat \\d+, and
 * filenames (with an extension) must beat the trailing number check.
 *
 * Groups:
 *   1 = key name of key=value
 *   2 = value portion of key=value
 *   3 = timecode HH:MM:SS(.ms)
 *   4 = bare number with optional unit
 *   5 = single-quoted string
 *   6 = filename with known extension
 */
const patternSource = [
  String.raw`(\b[a-z_]+)=([^\s,]+)`,
  String.raw`(\d+:\d\d:\d\d(?:\.\d+)?)`,
  String.raw`(\b\d+(?:\.\d+)?(?:kbit|fps|x|MB|GB|Hz|bit|ms|s)?\b)`,
  String.raw`('[^']*')`,
  String.raw`(\b[\w-]+\.(?:mkv|mp4|ass|srt|webm|avi))`,
].join('|');
const TOKEN_RE = new RegExp(patternSource, 'gi');

const tokenize = (s: string): Token[] => {
  const parts: Token[] = [];
  let last = 0;
  // Reset lastIndex — the regex is global and shared across calls.
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(s)) !== null) {
    if (m.index > last) parts.push({ k: 't', v: s.slice(last, m.index) });
    if (m[1] !== undefined) {
      parts.push({ k: 'key', v: m[1] });
      parts.push({ k: 't', v: '=' });
      parts.push({ k: 'num', v: m[2] });
    } else if (m[3] !== undefined) {
      parts.push({ k: 'time', v: m[3] });
    } else if (m[4] !== undefined) {
      parts.push({ k: 'num', v: m[4] });
    } else if (m[5] !== undefined) {
      parts.push({ k: 'str', v: m[5] });
    } else if (m[6] !== undefined) {
      parts.push({ k: 'file', v: m[6] });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ k: 't', v: s.slice(last) });
  return parts;
};

/**
 * One row in the live FFmpeg log panel. Tokens matched by `tokenize` get a
 * `hl-<kind>` class so the color palette in `primitives.css` highlights keys,
 * numbers, file paths, times, and quoted strings distinctly.
 */
export const LogLine = ({ ts, lvl, text }: LogLineProps) => {
  const parts = tokenize(text);
  return (
    <div className="log-line">
      <span className="log-ts">{ts}</span>
      <span className={`log-lvl ${lvl}`}>{lvl.toUpperCase()}</span>
      <span className="log-msg">
        {parts.map((p, i) =>
          p.k === 't' ? (
            <Fragment key={i}>{p.v}</Fragment>
          ) : (
            <span key={i} className={`hl-${p.k}`}>
              {p.v}
            </span>
          )
        )}
      </span>
    </div>
  );
};
