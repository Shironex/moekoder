import { createLogger, type Logger } from '@moekoder/shared';

/**
 * Renderer-side logger factory. Wraps `@moekoder/shared`'s universal logger
 * so every module gets a prefixed `Logger` instance — keeps call sites
 * consistent with the main process and unlocks log-level gating via the
 * `LOG_LEVEL` env. Use this instead of raw `console.*` for any diagnostic
 * output so we can forward or filter uniformly later.
 */
export const logger = (context: string): Logger => createLogger(context);
