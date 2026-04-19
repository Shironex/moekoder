/**
 * Moekoder icon surface.
 *
 * Direct lucide-react re-exports where a clean match exists, plus a handful
 * of custom 16px-grid SVGs for icons the design's single-stroke style differs
 * from lucide. Window-control icons in particular must match the exact
 * visual weight of the titlebar — the lucide Minus/Square/X are too
 * bold — so those stay inline.
 *
 * All custom icons render on a 16x16 viewBox with `strokeWidth="1.4"` to stay
 * consistent with lucide at the same size.
 */
import type { SVGProps } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Cpu,
  Disc,
  ExternalLink,
  FileVideo,
  Film,
  FolderOpen,
  Gauge,
  History,
  Pause,
  Play,
  Plus,
  Settings,
  SlidersHorizontal,
  Square,
  Subtitles,
  Terminal,
  Trash2,
  TrendingUp,
} from 'lucide-react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Shared SVG shell for custom (non-lucide) icons. Matches the reference
 * `IconBase` from the design's `src/icons.jsx`: 16x16 viewBox, 1.4 stroke,
 * rounded caps/joins, `currentColor` so `color` on the parent tints it.
 */
const IconBase = ({ children, size = 16, ...rest }: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

// ---------------------------------------------------------------------------
// Window-control icons — kept inline so their weight matches the titlebar.
// ---------------------------------------------------------------------------

export const IconMin = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3 12h10" />
  </IconBase>
);

export const IconMax = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="3" y="3" width="10" height="10" />
  </IconBase>
);

export const IconClose = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M3 3l10 10M13 3L3 13" />
  </IconBase>
);

// ---------------------------------------------------------------------------
// Semantic aliases over lucide icons. Names mirror the design's `icons.jsx`
// so ports of the prototype compile with a one-line search-and-replace.
// ---------------------------------------------------------------------------

export {
  ArrowRight as IconArrow,
  Check as IconCheck,
  ChevronRight as IconChevron,
  Clock as IconClock,
  Cpu as IconChip,
  Disc as IconDisc,
  ExternalLink as IconOpen,
  FileVideo as IconVideo,
  Film as IconFilm,
  FolderOpen as IconFolder,
  Gauge as IconGauge,
  History as IconHistory,
  Pause as IconPause,
  Play as IconPlay,
  Plus as IconPlus,
  Settings as IconSettings,
  SlidersHorizontal as IconSliders,
  Square as IconStop,
  Subtitles as IconSubs,
  Terminal as IconTerminal,
  Trash2 as IconTrash,
  TrendingUp as IconBitrate,
};
