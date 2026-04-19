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
  return { intro, releases };
}

export async function loadChangelog(path: string = CHANGELOG_PATH): Promise<ParsedChangelog> {
  const raw = await readFile(path, 'utf8');
  return parseChangelog(raw);
}
