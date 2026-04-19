import type { ReactNode } from 'react';

export type PageHeadScreen = 'idle' | 'encoding' | 'queue' | 'done';
export type PageHeadRoute = 'single' | 'queue';

interface PageHeadProps {
  /** Which screen the user is currently looking at. Drives the kanji chip. */
  screen: PageHeadScreen;
  /** Top-level route — rendered as the left-most crumb. */
  route: PageHeadRoute;
  /** Main title; renders inside an `<h1>`. */
  title: string;
  /** Optional descriptive subtitle under the title. */
  subtitle?: string;
  /** Optional right-side meta slot (timestamp, stats, etc). */
  right?: ReactNode;
  /** Extra nodes below the title block (chips, toolbars, …). */
  children?: ReactNode;
}

/**
 * Kanji-per-screen lookup. Each glyph is a single character chosen to reflect
 * the intent of the screen — begin / image / row / done.
 */
const SCREEN_KANJI: Record<PageHeadScreen, string> = {
  idle: '始',
  encoding: '像',
  queue: '列',
  done: '了',
};

/**
 * Top-of-screen header with breadcrumbs, title block, optional right-side
 * metadata, and a full-bleed kanji watermark (provided by `.watermark` in
 * `base.css` at the ancestor container level — PageHead only supplies the
 * heading scaffolding).
 */
export const PageHead = ({ screen, route, title, subtitle, right, children }: PageHeadProps) => {
  const kanji = SCREEN_KANJI[screen];
  return (
    <div className="page-head">
      <div className="title-block">
        <div className="crumbs">
          <span className="accent">{route === 'queue' ? 'Queue' : 'Single file'}</span>
          <span>/</span>
          <span>
            {kanji} {screen}
          </span>
        </div>
        <h1>{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
        {children}
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </div>
  );
};
