import type { ReactNode } from 'react';

interface AppShellProps {
  /** Left-rail sidebar content. Rendered only when `showSidebar` is true. */
  sidebar?: ReactNode;
  /** Hide the sidebar column (e.g. during onboarding / settings). */
  showSidebar?: boolean;
  /** Main content — typically one of the screens from `@/screens`. */
  children: ReactNode;
}

/**
 * Below-the-titlebar shell layout. Lays out the sidebar + main column as a
 * horizontal flex row and clips internal overflow so screen-level layouts
 * can scroll inside themselves without pushing the titlebar around.
 */
export const AppShell = ({ sidebar, showSidebar = true, children }: AppShellProps) => (
  <div className="relative z-[1] flex min-h-0 flex-1 overflow-hidden">
    {showSidebar && sidebar}
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
  </div>
);
