# Moekoder · 萌コーダー · 夜 (yoru) edition

Burn subtitles into video, cutely.

Moekoder is a desktop hardsub tool for anime power users — drop in an MKV and its ASS subtitle track, pick an output, and it produces a playable MP4 with subtitles burned into the picture. Built for people who already know what `CQ`, `NVENC`, and `libass` mean.

Part of the **Shiro Suite** — Shiranami 白波 · ShiroAni 白アニ · Moekoder 萌コーダー · KireiManga 綺麗漫画.

## Status

Early development. Pre-1.0. See [CHANGELOG.md](./CHANGELOG.md) for released versions.

## License

Moekoder Source Available License — see [LICENSE](./LICENSE). Personal use only; no redistribution.

## Quickstart

Requires Node 22.13+ and pnpm 9+.

```sh
# One-time install
pnpm install

# Run web dev server in one terminal
pnpm --filter @moekoder/web dev

# Build and launch desktop shell in another terminal
pnpm --filter @moekoder/desktop start
```

Phase 1 ships a placeholder desktop shell with a titlebar and four theme flips — real features land in v0.1.0. See `docs/roadmap/v0.1.0.md` for scope.
