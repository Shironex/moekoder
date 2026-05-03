/**
 * Minimal Keep-a-Changelog markdown parser.
 *
 * Reads the repository-level `CHANGELOG.md` at build time and returns a
 * structured list of releases. Tolerates the "Unreleased" placeholder that
 * the repo currently uses while no tags exist yet.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * CHANGELOG.md lives at the repo root.
 *
 * `process.cwd()` during `astro build` is the landing app directory
 * (`apps/landing`), so two `..` hops reach the repo root. This also
 * works inside the Docker build because the file is copied there.
 */
export const CHANGELOG_PATH = resolve(process.cwd(), '../../CHANGELOG.md');

export interface ChangelogSection {
  heading: string;
  entries: string[];
}

export interface ChangelogRelease {
  version: string;
  date: string | null;
  title: string;
  isUnreleased: boolean;
  sections: ChangelogSection[];
  /** Top-of-release paragraph text, if present before the first subsection. */
  intro: string[];
}

export interface ParsedChangelog {
  intro: string[];
  releases: ChangelogRelease[];
}

/**
 * Tiny inline-markdown pass for changelog text. Handles only the two
 * constructs that show up in this repo's CHANGELOG: `[label](url)` links
 * and `` `code spans` ``. Everything else passes through untouched. We
 * escape the source HTML first so an entry like `<script>` doesn't end
 * up live in the rendered page.
 *
 * Exported for unit tests and consumers (`changelog.astro`) that need to
 * emit pre-rendered HTML via `set:html`.
 */
export function renderInlineMarkdown(input: string): string {
  const escaped = input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Code spans first so a `[foo](bar)` inside backticks survives literally.
  const withCode = escaped.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);

  // [label](url) — only allow http(s) hrefs to avoid javascript: smuggling.
  return withCode.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );
}

const RELEASE_HEADING_RE = /^##\s+(.*)$/;
const SECTION_HEADING_RE = /^###\s+(.*)$/;
const LIST_ITEM_RE = /^[-*]\s+(.*)$/;
const VERSION_DATE_RE = /^\[?([^\]\s-]+)\]?\s*(?:-\s*(.+))?$/;

export function parseChangelog(markdown: string): ParsedChangelog {
  const lines = markdown.split(/\r?\n/);
  const intro: string[] = [];
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;
  let beforeFirstRelease = true;

  const pushRelease = () => {
    if (current) {
      if (currentSection) current.sections.push(currentSection);
      releases.push(current);
    }
    current = null;
    currentSection = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip the top-level H1 — anything above the first release heading is loose intro text.
    if (/^#\s+/.test(line)) continue;

    const releaseMatch = RELEASE_HEADING_RE.exec(line);
    if (releaseMatch) {
      pushRelease();
      beforeFirstRelease = false;
      const rest = releaseMatch[1]!.trim();
      const dateMatch = VERSION_DATE_RE.exec(rest);
      const version = dateMatch?.[1]?.trim() ?? rest;
      const date = dateMatch?.[2]?.trim() ?? null;
      const isUnreleased = /unreleased/i.test(version);
      current = {
        version,
        date,
        title: rest,
        isUnreleased,
        sections: [],
        intro: [],
      };
      continue;
    }

    const sectionMatch = SECTION_HEADING_RE.exec(line);
    if (sectionMatch && current) {
      if (currentSection) current.sections.push(currentSection);
      currentSection = { heading: sectionMatch[1]!.trim(), entries: [] };
      continue;
    }

    const listMatch = LIST_ITEM_RE.exec(line);
    if (listMatch) {
      const entry = listMatch[1]!.trim();
      if (currentSection) {
        currentSection.entries.push(entry);
      } else if (current) {
        current.intro.push(entry);
      } else {
        intro.push(entry);
      }
      continue;
    }

    // Paragraph text preserves as-is (skipping blanks).
    if (line.trim() === '') continue;
    if (beforeFirstRelease) {
      intro.push(line.trim());
    } else if (current) {
      current.intro.push(line.trim());
    }
  }

  pushRelease();
  // Drop empty `## [Unreleased]` placeholders so the page doesn't render an
  // orphan dashed card while there's no in-flight work to show. Real
  // releases always carry at least an intro paragraph or one section.
  const filtered = releases.filter(
    r => !(r.isUnreleased && r.intro.length === 0 && r.sections.length === 0)
  );
  return { intro, releases: filtered };
}

export async function loadChangelog(path: string = CHANGELOG_PATH): Promise<ParsedChangelog> {
  const raw = await readFile(path, 'utf8');
  return parseChangelog(raw);
}
