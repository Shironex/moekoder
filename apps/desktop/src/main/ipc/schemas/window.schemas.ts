import { z } from 'zod';

/**
 * Zod tuples for the window-control IPC channels. All three handlers are
 * parameter-free — they act on whichever renderer window currently has focus.
 */

/** `window:minimize` — no args. */
export const windowMinimizeSchema = z.tuple([]);

/** `window:maximize` — no args. Handler toggles between maximized and restored. */
export const windowMaximizeSchema = z.tuple([]);

/** `window:close` — no args. */
export const windowCloseSchema = z.tuple([]);
