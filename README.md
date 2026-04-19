# Moekoder · 萌コーダー · 夜 (yoru) edition

Burn subtitles into video, cutely.

Moekoder is a desktop hardsub tool for anime power users — drop in an MKV and its ASS subtitle track, pick an output, and it produces a playable MP4 with subtitles burned into the picture. Built for people who already know what `CQ`, `NVENC`, and `libass` mean.

Part of the **Shiro Suite** — Shiranami 白波 · ShiroAni 白アニ · Moekoder 萌コーダー · KireiManga 綺麗漫画.

## Status

Early development. Pre-1.0. See [CHANGELOG.md](./CHANGELOG.md) for released versions.

## Quickstart

Requires Node 22.13 (see `.nvmrc`) and pnpm 9+.

```sh
# One-time install
nvm use 22.13
pnpm install

# Run web + desktop in one shot (root script)
pnpm dev
```

`pnpm dev` starts the Vite web dev server on `localhost:15180`, waits for it to
come up, then launches Electron pointed at that URL.

## Packaging

```sh
# Default for the host platform
pnpm --filter @moekoder/desktop package

# Explicit targets
pnpm --filter @moekoder/desktop package:win
pnpm --filter @moekoder/desktop package:mac
```

Installers land in `apps/desktop/release/` (NSIS `.exe` on Windows, `.dmg` on
macOS). Before the first package you may want icons — drop a 1024x1024 PNG at
`apps/desktop/resources/mascot.png` and run `pnpm generate-icons`.

## Cutting a release

1. `pnpm version:patch` (or `version:minor` / `version:major`) — bumps every
   workspace package.json, refreshes the lockfile, commits, and tags `vX.Y.Z`.
2. `git push origin main --tags`.
3. Create a GitHub Release from the pushed tag.
4. CI's Release Build workflow builds Windows + macOS installers via
   electron-builder and attaches them to the release.

## License

Moekoder Source Available License — see [LICENSE](./LICENSE). Personal use only; no redistribution.
