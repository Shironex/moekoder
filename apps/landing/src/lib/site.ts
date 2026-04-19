/**
 * Site-wide constants for the Moekoder landing site.
 */

export const GITHUB_REPO_URL = 'https://github.com/Shironex/moekoder';
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_RELEASES_LATEST_URL = `${GITHUB_RELEASES_URL}/latest`;
export const GITHUB_RELEASES_API_URL =
  'https://api.github.com/repos/Shironex/moekoder/releases/latest';

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateString));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(bytes / 1024)} KB`;
  }
  return `${new Intl.NumberFormat('en', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024))} MB`;
}
