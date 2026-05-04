import { useCallback } from 'react';
import { useElectronAPI, useSetting } from '@/hooks';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/cn';

const log = logger('queue-settings');

const CONCURRENCY_OPTIONS: ReadonlyArray<1 | 2 | 3 | 4> = [1, 2, 3, 4];
const ROUTE_OPTIONS: ReadonlyArray<{ value: 'single' | 'queue'; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'queue', label: 'Queue' },
];

/** Hard limits for the retry-budget input — generous range, but the
 *  manager already clamps `maxRetries` and the user has zero reason to
 *  ask for 50+ retries on a queue meant to walk away from. */
const MIN_RETRIES = 0;
const MAX_RETRIES = 10;

/** Backoff input is shown in seconds (1..60s) and stored as ms. The
 *  manager uses `backoffMs * 2^attempts`, so the displayed value is just
 *  the base — attempt 2 waits 2x base, attempt 3 waits 4x base, etc. */
const MIN_BACKOFF_S = 1;
const MAX_BACKOFF_S = 60;

interface SegmentedProps<T extends string | number> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  ariaLabel: string;
}

const Segmented = <T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className="inline-flex gap-0.5 rounded-md border border-border bg-popover/40 p-0.5"
  >
    {options.map(opt => {
      const active = opt.value === value;
      return (
        <button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(opt.value)}
          className={cn(
            'min-w-[44px] rounded-sm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] transition',
            active
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]'
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

/**
 * Settings panel for the v0.3 queue. Surfaces the persisted prefs that
 * previously could only be poked from devtools via `electronAPI.store.set`.
 *
 * Design notes:
 *   · Concurrency mirrors the segmented control on the Queue screen so the
 *     user has a single source of truth (electron-store); the queue screen
 *     also pings the manager directly so an in-flight queue picks up the
 *     new cap on the next dispatch tick. From the Settings screen the
 *     queue might not be running, so we only persist — the manager pulls
 *     the value at next `start()` regardless.
 *   · Retries / backoff write directly to electron-store; the manager reads
 *     them through its own zod-validated channel only when the user starts
 *     the queue, so a Settings change while idle takes effect on the next
 *     run with no special wiring.
 *   · The default-route control writes `queueDefaultRoute`; the App reads
 *     that on hydration to pick `single-idle` vs `queue` as the boot view.
 */
export const QueueSettingsSection = () => {
  const api = useElectronAPI();
  const [concurrency, setConcurrency] = useSetting('queueConcurrency');
  const [maxRetries, setMaxRetries] = useSetting('queueMaxRetries');
  const [backoffMs, setBackoffMs] = useSetting('queueBackoffMs');
  const [notifyOnComplete, setNotifyOnComplete] = useSetting('queueNotifyOnComplete');
  const [defaultRoute, setDefaultRoute] = useSetting('queueDefaultRoute');

  const onConcurrencyChange = useCallback(
    (next: 1 | 2 | 3 | 4) => {
      setConcurrency(next).catch(err => log.warn('persist queueConcurrency failed', err));
      // Mirror to the manager so an already-running queue picks up the new
      // cap on its next dispatch tick. Best-effort — the manager re-reads
      // the persisted value at `start()` either way.
      api.queue
        .setSettings({ concurrency: next })
        .catch(err => log.warn('queue.setSettings concurrency failed', err));
    },
    [api, setConcurrency]
  );

  const onMaxRetriesChange = useCallback(
    (raw: string) => {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.max(MIN_RETRIES, Math.min(MAX_RETRIES, parsed));
      setMaxRetries(clamped).catch(err => log.warn('persist queueMaxRetries failed', err));
      api.queue
        .setSettings({ maxRetries: clamped })
        .catch(err => log.warn('queue.setSettings maxRetries failed', err));
    },
    [api, setMaxRetries]
  );

  const onBackoffSecondsChange = useCallback(
    (raw: string) => {
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.max(MIN_BACKOFF_S, Math.min(MAX_BACKOFF_S, parsed));
      const ms = Math.round(clamped * 1000);
      setBackoffMs(ms).catch(err => log.warn('persist queueBackoffMs failed', err));
      api.queue
        .setSettings({ backoffMs: ms })
        .catch(err => log.warn('queue.setSettings backoffMs failed', err));
    },
    [api, setBackoffMs]
  );

  const onNotifyChange = useCallback(
    (next: boolean) => {
      setNotifyOnComplete(next).catch(err => log.warn('persist queueNotifyOnComplete failed', err));
    },
    [setNotifyOnComplete]
  );

  const onDefaultRouteChange = useCallback(
    (next: 'single' | 'queue') => {
      setDefaultRoute(next).catch(err => log.warn('persist queueDefaultRoute failed', err));
    },
    [setDefaultRoute]
  );

  const concurrencyValue = concurrency ?? 1;
  const maxRetriesValue = maxRetries ?? 2;
  const backoffSecondsValue = (backoffMs ?? 4000) / 1000;
  const notifyValue = notifyOnComplete ?? true;
  const routeValue = defaultRoute ?? 'single';

  return (
    <div className="flex flex-col gap-5">
      {/* Concurrency */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-sm text-foreground">Concurrency</span>
          <span className="text-[12px] text-muted-foreground">
            How many encodes run in parallel. Mirrors the Queue screen control. Default 1 keeps the
            Single route's one-encode-at-a-time guarantee untouched.
          </span>
        </div>
        <Segmented
          value={concurrencyValue}
          options={CONCURRENCY_OPTIONS.map(v => ({ value: v, label: String(v) }))}
          onChange={onConcurrencyChange}
          ariaLabel="Queue concurrency"
        />
      </div>

      {/* Max retries */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-sm text-foreground">Max retries</span>
          <span className="text-[12px] text-muted-foreground">
            How many times a failed item retries before it gives up. Total attempts ={' '}
            {maxRetriesValue + 1}.
          </span>
        </div>
        <input
          type="number"
          min={MIN_RETRIES}
          max={MAX_RETRIES}
          step={1}
          value={maxRetriesValue}
          onChange={e => onMaxRetriesChange(e.target.value)}
          aria-label="Maximum retries per item"
          className="w-[88px] rounded-md border border-border bg-card/40 px-3 py-1.5 text-right font-mono text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      {/* Retry backoff */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-sm text-foreground">Retry backoff</span>
          <span className="text-[12px] text-muted-foreground">
            Wait between retry attempts. Doubles each retry: {backoffSecondsValue.toFixed(0)}s →{' '}
            {(backoffSecondsValue * 2).toFixed(0)}s → {(backoffSecondsValue * 4).toFixed(0)}s…
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={MIN_BACKOFF_S}
            max={MAX_BACKOFF_S}
            step={1}
            value={backoffSecondsValue}
            onChange={e => onBackoffSecondsChange(e.target.value)}
            aria-label="Base retry backoff in seconds"
            className="w-[88px] rounded-md border border-border bg-card/40 px-3 py-1.5 text-right font-mono text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">s</span>
        </div>
      </div>

      {/* Notify on complete */}
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={notifyValue}
          onChange={e => onNotifyChange(e.target.checked)}
        />
        <span className="flex flex-col leading-tight">
          <b className="font-display text-sm text-foreground">Notify when queue finishes</b>
          <span className="text-[12px] text-muted-foreground">
            Show a desktop notification when the queue drains so you can walk away and still know
            when to come back.
          </span>
        </span>
      </label>

      {/* Default route */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-display text-sm text-foreground">Default screen on launch</span>
          <span className="text-[12px] text-muted-foreground">
            Which tab Moekoder opens on launch. Pick Queue if you mostly batch.
          </span>
        </div>
        <Segmented
          value={routeValue}
          options={ROUTE_OPTIONS}
          onChange={onDefaultRouteChange}
          ariaLabel="Default route on launch"
        />
      </div>
    </div>
  );
};
