import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combine Tailwind class strings with conditional values. `clsx` handles the
 * conditional/array/object shorthand; `tailwind-merge` dedupes conflicting
 * utility classes so the rightmost wins (e.g. `cn('p-2', 'p-4')` -> `p-4`).
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
