# Desktop build resources

electron-builder expects icon assets in this directory:

- `icon.ico` — Windows installer icon (multi-resolution: 16, 32, 48, 256).
- `icon.icns` — macOS application icon.
- plus optional PNGs at `icon.png`, `icon-16.png`, `icon-32.png` for Linux and splash.

These are generated from a source mascot PNG by the workspace script.
Place a source mascot at `apps/desktop/resources/mascot.png` and run:

```sh
pnpm generate-icons
```

## TODO

- [ ] Drop a mascot PNG at `apps/desktop/resources/mascot.png` (recommended 1024x1024, transparent background).
- [ ] Run `pnpm generate-icons` to emit `icon.ico` + sized PNGs here.
- [ ] macOS `.icns` generation requires `iconutil` (Darwin-only). Generate on a Mac or via CI.

Until the icons exist, `electron-builder` emits a non-fatal warning and falls
back to its default Electron icon.
