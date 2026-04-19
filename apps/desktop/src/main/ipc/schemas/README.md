# IPC payload schemas

Runtime zod validation for every `ipcMain.handle` channel exposed to the
renderer. This is a defence-in-depth layer complementing the preload
allow-list — the allow-list decides which channels are reachable, the schemas
decide what payload shapes each channel accepts.

## Conventions

- **One file per domain.** `app.schemas.ts` for `app:*` channels,
  `store.schemas.ts` for `store:*`, etc. Co-located schemas keep each file
  small and reviewable.
- **Tuple-per-channel.** Electron forwards positional args as a rest array,
  so each channel's schema is a `z.tuple([...])` matching its parameter list.
- **Zero-arg channels use `z.tuple([])`.** Keeps the validation call site
  uniform (`handle(channel, schema, fn)`).
- **Export naming.** `<channelVerb>Schema` — e.g. `appOpenExternalSchema`,
  `storeGetSchema`. Predictable, greppable.
- **Desktop-local.** These schemas live here, not in `@moekoder/shared`. The
  shared package stays runtime-dep-free on purpose; only the Electron main
  process needs the zod runtime.
- **Wire to handlers via `handle(channel, schema, fn)`.** Validation failures
  throw `IpcError('INVALID_INPUT', …, issues)` and bypass any fallback.
