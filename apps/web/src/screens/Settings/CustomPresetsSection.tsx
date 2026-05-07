import { useCallback, useMemo, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import { useSetting } from '@/hooks';
import { logger } from '@/lib/logger';
import { codecOf, hwAccelOf, CODEC_LABEL, HW_LABEL } from '@/lib/encoding-profile';
import type { CustomPreset, EncodingProfile } from '@moekoder/shared';

const log = logger('custom-presets');

/** Hard cap so the preset dropdown stays usable. */
const MAX_PRESETS = 20;
const MAX_NAME_LEN = 40;

/**
 * Settings panel for v0.4 custom presets. Reads + writes the
 * `customPresets` array on `electron-store`. Each entry is a full
 * encoding-profile snapshot tagged with a stable id + display name +
 * `version: 1` for forward-compat migrations.
 *
 * Workflow:
 *   1. User tunes the Encoding section (above) to a profile they like.
 *   2. Type a name → "Save current as preset" stores a snapshot of the
 *      live `encoding` setting.
 *   3. "Apply" replaces the active `encoding` setting with the snapshot.
 *   4. "Delete" drops the entry from the list.
 *
 * Import/export to JSON files is deferred to v0.5 per the v0.4 research
 * doc; v0.4 only supports save/apply/delete in-app.
 */
export const CustomPresetsSection = () => {
  const [encoding, setEncoding] = useSetting('encoding');
  const [presets, setPresets] = useSetting('customPresets');
  const [draftName, setDraftName] = useState('');

  const list = useMemo(() => presets ?? [], [presets]);
  const trimmedName = draftName.trim();
  const atCap = list.length >= MAX_PRESETS;
  const nameClash = list.some(p => p.name.toLowerCase() === trimmedName.toLowerCase());
  const canSave = !atCap && trimmedName.length > 0 && !nameClash && Boolean(encoding);

  const onSave = useCallback((): void => {
    if (!canSave || !encoding) return;
    const next: CustomPreset = {
      version: 1,
      id: crypto.randomUUID(),
      name: trimmedName.slice(0, MAX_NAME_LEN),
      createdAt: Date.now(),
      settings: { ...encoding },
    };
    setPresets([...list, next]).catch(err => log.warn('persist customPresets failed', err));
    setDraftName('');
  }, [canSave, encoding, list, trimmedName, setPresets]);

  const onApply = useCallback(
    (preset: CustomPreset): void => {
      setEncoding({ ...preset.settings } as EncodingProfile).catch(err =>
        log.warn('persist encoding from preset failed', err)
      );
    },
    [setEncoding]
  );

  const onDelete = useCallback(
    (id: string): void => {
      setPresets(list.filter(p => p.id !== id)).catch(err =>
        log.warn('persist customPresets delete failed', err)
      );
    },
    [list, setPresets]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Save form */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="font-display text-sm text-foreground">Save current as preset</span>
          <span className="text-[12px] text-muted-foreground">
            Captures whatever's set in the Encoding section above. Survives an app restart.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftName}
            onChange={e => setDraftName(e.target.value.slice(0, MAX_NAME_LEN))}
            maxLength={MAX_NAME_LEN}
            placeholder="My preset"
            aria-label="Preset name"
            className="w-[200px] rounded-md border border-border bg-card/40 px-3 py-1.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={!canSave}
            title={
              atCap
                ? `Cap reached: ${MAX_PRESETS} presets max`
                : nameClash
                  ? 'A preset with that name already exists'
                  : trimmedName.length === 0
                    ? 'Name required'
                    : 'Save preset'
            }
          >
            <Plus size={14} />
            Save
          </Button>
        </div>
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-popover/20 px-4 py-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          no saved presets yet
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map(preset => {
            const codec = codecOf(preset.settings);
            const hwAccel = hwAccelOf(preset.settings);
            const cq = preset.settings.cq as number | undefined;
            return (
              <li
                key={preset.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-popover/30 px-4 py-3"
              >
                <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                  <span className="font-display text-sm text-foreground">{preset.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {CODEC_LABEL[codec]} · {HW_LABEL[hwAccel]} · CQ {cq ?? '?'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onApply(preset)}>
                    <Upload size={14} />
                    Apply
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(preset.id)}>
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
