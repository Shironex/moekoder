# Changelog

All notable changes to Moekoder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-08-21

Localization and AMD hardware encoding, on top of a three-month dependency and security sweep. **Every UI string now ships in English and Polish** behind a language picker that lives in both Settings and the onboarding Welcome step. **AMD GPUs finally get a hardware path** — the encoder had no AMF branch at all, so an AMD-only machine on the default `hwAccel:'nvenc'` emitted `h264_nvenc` and failed with "unknown encoder"; AMF now has real args and the GPU probe is wired into the orchestrator so a detected encoder actually gets used. The probe also stopped taking ffmpeg's word for it: every detected encoder is confirmed with a 1-frame test-encode before it is offered. Alongside that, thirty-odd dependency commits took `pnpm audit` from 1 critical / 15 high / 20 moderate to zero, and carried Electron to 43, React to 19 and Astro to 7.

### Added

- **UI localization (English + Polish)** — every user-facing string across screens, chrome components and the 14-step onboarding is extracted into 14 namespaced en/pl locale files and routed through `useTranslation`. i18next initialises synchronously before React mounts (the init side-effect is imported ahead of `App` in the renderer entry, so a module-scope lookup can never race it). Decorative kanji/romaji eyebrows are left inline. A self-contained `LanguagePicker` appears in Settings and on the onboarding Welcome step.
- **`uiLanguage` setting** — nullable, OS-detect-then-sticky: unset means "follow the OS", and the first explicit pick freezes the choice. `useUiLanguage` / `useUiLanguageSync` read a localStorage boot mirror for the first paint and treat electron-store as the durable source. The main-process queue-complete notification is localized off the persisted value, since it can't reach the renderer's i18next instance. Includes key-parity, plural and configured-instance tests, so a locale file that drifts out of sync fails CI.
- **AMF (AMD) H.264/HEVC encoding** — new `H264AmfSettings` / `HevcAmfSettings` union members and `h264_amf` / `hevc_amf` branches in `args.ts`, written in AMF's own rate-control vocabulary (`-quality {speed|balanced|quality} -rc cqp -qp_i/-qp_p/-qp_b`, pixel format `yuv420p`, `p010le` for 10-bit HEVC) and verified against ffmpeg's `amfenc` source rather than analogized from NVENC. `{codec:'av1',hwAccel:'amf'}` is intentionally non-representable — ffmpeg has no `av1_amf`.
- **`resolveHwAccel()` and probe-driven encoder selection** — a best-effort `probeGpu` dependency is wired into the orchestrator and soft-fails back to the requested settings when the probe is unavailable, mirroring the font-extractor pattern. This is what closes the AMD gap end to end: detection already worked, nothing consumed it.
- **Verified encoder detection** — `verifyEncoderWorks()` runs a minimal 1-frame lavfi→null test-encode per detected encoder and keeps it only on a clean exit; non-zero exit, spawn error and timeout (SIGTERM→SIGKILL) all drop it. An advertised-but-broken hardware encoder is now caught at probe time instead of at the user's first real job. Results are cached in electron-store behind a version key with a 7-day TTL, so the test runs once rather than on every launch. The IPC contract gains a `verified` flag and a zod `gpuProbeResultSchema`.
- **Per-dialog last-used directory** — `UserSettings.lastDialogDirs` maps a `DialogDirKind` (`video` / `subtitle` / `save-file` / `output-folder`) to the directory it was last opened at, so the media library, the subtitle folder and the output folder each keep separate memory. Folder picks remember the folder itself (reopening lands inside it); file picks remember `dirname()`. A cancelled dialog remembers nothing, a directory that no longer resolves is dropped at read time rather than handed to Electron dead, and an explicit `defaultPath` still wins over the remembered one.
- **Test coverage** — desktop 321 passing / 2 skipped (was 263), web 51 (was 28). Includes `dialog.test.ts` (20 cases) for a channel that previously had none.

### Changed

- **Electron 42.9.3 → 43.4.1.** Five of the six entries in Electron's 43.0 breaking-change list resolve to zero call sites here (three are Linux-only and the build targets only win/mac; the `NativeImage.toBitmap()` sRGB change and the `chrome.scripting` fallback-frame change have no matching usage). The sixth — dialogs defaulting to the Downloads folder instead of the OS's remembered location — is what the per-dialog directory memory above was written to absorb, and it landed first, so the major itself carries no known UX regression.
- **React 18 → 19** across `@moekoder/web` and `@moekoder/landing`, bumped in lockstep so a single `@types/react` major exists in the store. No source changes were needed — the renderer was already on `createRoot` and every ref passes an initial argument.
- **Astro 6 → 7** on the landing app (Rust compiler, Vite 8), with `@astrojs/react` 5 → 6. Also `tailwind-merge` 2 → 3 (Tailwind v4 was already in place, so v2 was a latent class-group mismatch), `sharp` 0.34 → 0.35, `concurrently` 9 → 10, `lint-staged` 16 → 17, `@types/yauzl` 2 → 3, and `electron-builder` pinned to 26.15.7.
- **`engines.node` raised to `>=22.22.1`** — required by lint-staged 17's Node floor.
- **Icon set and OG card regenerated** — the libvips 8.16 → 8.18.3 shift under sharp 0.35 moved a few pixels in `icon-16.png` / `icon-32.png`, and satori 0.33.0 made HarfBuzz shaping unconditional, which changes text measurement. Both artifacts are tracked, so both were re-rendered from the current toolchain.
- **GPU-probe verifications run sequentially.** They were concurrent, which is faster in principle; see Fixed.

### Fixed

- **Concurrent probe verification dropped working encoders** — running the test-encodes through `Promise.allSettled` let them race on GPU-context initialisation and hit driver concurrent-session limits (NVENC / AMF / QSV), so a perfectly good encoder could be marked unavailable. They now run one at a time; a 1-frame test is under 100 ms, so total probe latency stays sub-second.
- **Polish word order in container labels** — `"{c.name} {containerSuffix}"` rendered "MP4 kontener". The two fragments are now a single `containerLabel` key with a `{{name}}` placeholder, so each locale places the noun itself (`"{{name}} container"` / `"kontener {{name}}"`).
- **Install-stage label was force-lowercased** — `.toLowerCase()` on a translated string applies locale-independent casing rules (wrong for languages like Turkish) and overrides the translator's intent. The stage label renders as authored.
- **Queue retry button's accessible name** — the retry `aria-label` pulled from the `common` namespace while its sibling buttons used queue-namespace keys; it now uses `queue.retryLabel`.
- **Inconsistent Windows install-path casing** in onboarding copy — the engine-gate destination and `dl.install.sub` disagreed (`moekoder` vs `MoeKoder`); both now match `APP_NAME`, which is the actual `%LOCALAPPDATA%` folder name.
- **Landing OG card spacing under satori 0.33.0** — HarfBuzz shaping stopped applying letter-spacing to collapsible whitespace, collapsing the word gaps in the eyebrow and meta rows into letter gaps, and re-measured the 萌コーダー run 18px narrower, sliding the decorative rule left into the kana. Whitespace runs are now NBSP (which is shaped as a real glyph and still takes letter-spacing) and the width delta is compensated with padding. The card differs from the 0.26.0 baseline by 5 pixels out of 756,000, all antialiasing.

### Security

`pnpm audit` on the full graph went from 1 critical / 15 high / 20 moderate / 1 low to **0 vulnerabilities**, with no `ignoreCves` suppressions left in place.

- **`electron-updater` 6.8.3 → 6.8.9** — the highest-priority fix in the sweep, since it runs on end-user machines. Pulls `builder-util-runtime` 9.7.0, closing GHSA-p2f4-r6v6-j797 (a cross-origin redirect leaks `Authorization` / `PRIVATE-TOKEN` headers) plus a js-yaml quadratic-DoS advisory.
- **Electron 42.5.0 → 42.8.1 ahead of the 43 bump** closed CVE-2026-70606 (protocol-handler session-isolation bypass). No custom protocol handlers exist here, so the surface wasn't reachable either way.
- **`pnpm.overrides` floors raised and bounded** — `fast-uri`, `shell-quote`, `form-data`, `brace-expansion`, `undici`, `tmp`, `svgo`, `yaml`, `js-yaml`, `nanoid`, `vite`, `@babel/core`, `devalue`, `ip-address`. Several floors were unbounded above and pnpm had resolved them past what their consumers declare (`nanoid` to an ESM-only v6 behind postcss's `^3.3.17`, `@babel/core` to v8 behind `@vitejs/plugin-react`'s `^7.29.0`); each is now capped at the reviewed major.
- **A stale `electron-builder-squirrel-windows@26.8.1` chain was collapsed** — it dragged in its own old `app-builder-lib` with vulnerable `tar`, `js-yaml`, `fast-uri` and `builder-util-runtime`, duplicating packages the top-level resolution had already fixed. Because it and `app-builder-lib` pin each other as exact mutual peers, pnpm kept reusing the stale snapshot; adding it as an explicit devDependency gave the resolver a real edge and cleared the critical `tar` advisory along with several highs.
- **Dev-path fixes** — `vite` 8.0.13 → 8.1.5 (CVE-2026-53571, `server.fs.deny` bypass on Windows alternate paths), `esbuild` 0.28.0 → 0.28.1 (GHSA-g7r4-m6w7-qqqr, arbitrary file read via the dev server), `wait-on` 9.0.10 → 9.1.0 (clears all 8 axios advisories), and `astro` 7.0.4 → 7.1.3 (3 moderates, cascading svgo and postcss fixes).
- Full audit trail: `docs/deps/2026-08-06-audit-standard-2026-08.md`, `docs/deps/2026-08-20-audit-standard.md`, `docs/migrate/2026-08-20-electron-43.md`, `docs/migrate/2026-08-20-satori-0.33.0.md`.

### Known Limitations

- **The AMF encoder path has not been validated on real AMD hardware.** There is no AMD GPU in CI, so `args.test.ts` asserts arg _shape_ only — the flags were derived from ffmpeg's `amfenc` source, not from a successful encode. If you have an AMD card, a 1-frame encode confirming ffmpeg accepts these flags is the single most useful bug report you can file against this release.
- Multiple subtitle tracks in a single mux is still out of scope — one external `.ass` per mux. It was pencilled in for v0.7 and did not make it.
- Extraction is still copy-or-transcode between text formats only; image subtitles (PGS / VOBSUB) can't be exported.
- Same as v0.5.x and v0.6.0: binaries are unsigned, the auto-updater is Windows-only, and there's no Linux build yet. Embedded-font extraction still runs per-job (no `<userData>/fonts/<sourceHash>/` cache).

## [0.6.0] - 2026-05-22

Mux, don't burn. Two complementary subtitle features that skip libass entirely. **Soft-sub mux** stream-copies the source video + audio and muxes an external `.ass` in as a separate, selectable subtitle track — an MKV that opens in VLC / mpv with the subs toggleable, produced in seconds instead of minutes because nothing is re-encoded. **Subtitle extraction** is the inverse: open a container, probe its embedded subtitle streams, and pull any of them out to standalone `.ass` / `.srt` files, transcoding between text formats on the way out if you ask for it.

### Added

- **Soft-sub mux mode** — "Mux only (soft subs)" toggle in Settings → Encoding. When on, the encoder bypasses the libass burn-in filter and instead emits `ffmpeg -i <video> -i <subs> -map 0:v -map 0:a -map 1:0 -c copy -c:s ass -metadata:s:s:0 language=<lang> -disposition:s:0 default <out.mkv>` — video and audio are stream-copied, the `.ass` rides along as a default-flagged subtitle track. Container is forced to MKV (MP4 soft-subs warn). Language metadata is derived from the subtitle filename (`.en.ass` / `.pl.ass` → `eng` / `pol`, ISO-639-2) with a manual override field. Reuses the existing encode pipeline and `-progress` parser; the bar fills near-instantly since the job is I/O-bound, not encode-bound.
- **Subtitle extraction screen** — a dedicated Extract view (new Titlebar entry). Open a container and the existing `ffmpeg:probe` lists its embedded subtitle streams (index / codec / language / title) in a multi-select table; choose an output folder and pull the selected text tracks out. Image-based subtitles (PGS / VOBSUB) are surfaced but non-selectable — they have no text representation.
- **Extraction output-format selector** — `ASS` / `SRT` / `Match source`, defaulting to ASS (anime subtitles are authored in ASS). Copies the stream verbatim when the source already matches the chosen format; transcodes otherwise (a SubRip track out to `.ass`, or `.ass` down to `.srt` with a styling-loss note). Backed by a shared `resolveSubtitleOutput` codec ⇄ extension resolver and a new `subtitle:extract` IPC channel.
- **Test coverage** — new mux-arg, subtitle-codec, and extractor suites plus renderer-side codec / language tests. Desktop test count: 263 (was 234); web suite: 28.

### Changed

- **Extraction filenames carry the track ordinal** — `<stem>.<lang>.s<N>.<ext>` so two same-language tracks (a full + a signs track both tagged `eng`) no longer collide and overwrite each other.
- **Removed the deprecated `escapeSubtitlePath` / `escapeSubtitlePathFor` libass-escape aliases** — they were marked for removal in v0.6.0 and had no remaining callers. Mux and extract args go straight to `spawn` (no shell, no libass filter), so no path escaping is needed on those paths.

### Fixed

- **`text`-codec extraction mismatch** — the generic ffprobe `text` tag was classified as extractable but had no extension mapping, so a source-format extract emitted `-c:s copy` into a fabricated `.ass` file and failed in ffmpeg. `text` is no longer treated as a selectable text codec.
- **Dropped-queue container extension stale closure** — the drop-to-queue handler read the mux-influenced output extension but didn't list it as a dependency, so toggling mux mode could leave queued items with the wrong container extension until an unrelated re-render.

### Known Limitations

- Multiple subtitle tracks in a single mux is out of scope — one external `.ass` per mux (planned for v0.7).
- Extraction is copy-or-transcode between text formats only; image subtitles (PGS / VOBSUB) can't be exported.
- Same as v0.5.x: binaries are unsigned, the auto-updater is Windows-only, and there's no Linux build yet. Embedded-font extraction still runs per-job (no `<userData>/fonts/<sourceHash>/` cache).

## [0.5.1] - 2026-05-22

Windows onboarding hotfix. The pinned BtbN `autobuild-YYYY-MM-DD-HH-MM` ffmpeg download URL started returning 404 — BtbN prunes old dated autobuilds on a rolling schedule, so the snapshot tag we hard-coded for v0.5.0 eventually disappeared and first-run ffmpeg auto-install broke on Windows. MoeKoder now resolves the Windows build at runtime against the permanent rolling `latest` tag and verifies it with the SHA-256 the GitHub Releases API reports per asset, so supply-chain verification is preserved without depending on a tag that can vanish.

### Fixed

- **Windows ffmpeg download 404** — `getSourceForPlatform('win32')` no longer points at a dated `autobuild-*` tag that BtbN later deletes. New `resolveWindowsSource()` queries `api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest`, selects the stable `ffmpeg-n8.1-latest-win64-gpl-8.1.zip` asset, and builds the `BinaryArchive` from its live `browser_download_url` and the API-reported `digest`. macOS stays a static evermeet.cx pin.

### Changed

- **`getSourceForPlatform` is now async** — both platform branches share one awaitable call site; `ensureInstalled` awaits the resolved source before downloading. The Windows path is resolved on demand; macOS returns its static source.
- **Integrity verification never silently dropped** — `resolveWindowsSource()` throws a clear, actionable error on any failure (network, missing asset, or a missing/malformed `sha256:<hex>` digest) rather than degrading to an unverified download.

### Added

- **`fetchGitHubJson<T>()` in `main/http.ts`** — gated JSON GET that rides the same per-host rate-limit clock as `downloadToFile`, sends the `User-Agent` + `Accept: application/vnd.github+json` headers the GitHub REST API requires, and throws a host-prefixed error (status + statusText) on any non-2xx so callers never parse an HTML error page as JSON.
- **`api.github.com` host gate (1000 ms)** — spacing keeps a single install's resolution calls clear of GitHub's 60 req/hr/IP unauthenticated ceiling.
- **Offline-deterministic tests** — `manager.test.ts` stubs `fetch` with a representative `latest` release payload (throwaway digest) to cover asset selection, the missing-asset throw, and the missing/invalid-digest throw. Test count: 234 (was 229).

## [0.5.0] - 2026-05-17

MKV embedded-font extraction release. When the source is an MKV with attached fonts — standard practice for anime fansubs that ship `\fn(CustomFont)` typesetting in their ASS scripts — MoeKoder now extracts every font attachment into a per-job temp dir and feeds the path to libass via the `subtitles=...:fontsdir=` option. Burned output finally renders typeset cues with the fonts the author intended instead of silently falling back to Arial.

### Added

- **MKV attachment extraction** — new `font-extractor` module runs `ffmpeg -dump_attachment:t '' -i <video>` against a per-job `os.tmpdir()/mkfont-*` directory, accepts the well-known exit-code-1-on-success quirk, filters the dump to font extensions (`.ttf .otf .ttc .woff .woff2`) plus mime hints, and returns the dir + basenames. Returns `null` when there are no font-shaped attachments to dump (cover-art-only MKVs short-circuit before invoking ffmpeg).
- **libass `fontsdir=` wiring** — `buildFilterChain` learns an optional `fontsDir` argument and emits `subtitles='<sub>':fontsdir='<dir>'` ahead of the codec-aware pixel-format filter when set. v0.4 byte-for-byte regression locked — no `fontsDir` ⇒ the exact same arg array as v0.4.
- **Orchestrator lifecycle wiring** — after preflight and before `createProcessor`, the orchestrator probes attachments, calls `extractFonts(...)`, and threads the resulting dir onto `EncodeJob.fontsDir`. Both terminal callbacks (`onComplete` and `onError` / CANCELLED) run `cleanupFontsDir(...)` so the temp dir is removed whether the encode succeeded, errored, or was user-cancelled.
- **Settings → Embedded fonts toggle** — new section in `apps/web/src/screens/Settings.tsx` ("字 · ji"). Defaults to **on** so anime fansubs render correctly out of the box; flip off to restore v0.4 behaviour (libass falls back to system fonts only).
- **Missing-font diagnostic** — after a successful extraction the orchestrator regex-scans the ASS subtitle for `\fn(Name)` overrides and emits a `warn` per reference not present among the extracted basenames (case-insensitive, stem-matched). Surfaces in the same job-log channel that feeds both the Single-route log panel and the queue card's expand drawer.
- **`useEmbeddedFonts` setting key** — `boolean`, default `true`, in `packages/shared/src/settings/schema.ts`. Read directly by the orchestrator at job-start time so the renderer doesn't need a new IPC channel and the queue manager doesn't need to thread the flag.
- **`OrchestratorDeps` seams** — `probeAttachments`, `extractFonts`, `cleanupFontsDir`, `getUseEmbeddedFonts`, and `readSubtitleFile` are now injectable so every branch (toggle on/off, attachments yes/no, extractor success/failure, missing-font diagnostic, cleanup-on-cancel) runs in vitest without spawning ffmpeg or touching disk.
- **39 new vitest tests** — 2 in `probe.test.ts` (multi-font fixture + missing-tag fallback), 3 in `path-escape.test.ts` (fontsdir-style inputs + alias), 4 in `args.test.ts` (fontsdir token + v0.4 regression lock + NVENC pixel-format ordering + libx264 path), 21 in `font-extractor.test.ts` (filter + extract + cleanup + `\fn` scan + diff), and 9 in `orchestrator.test.ts` (toggle off, no attachments, extract + cleanup on success / cancel / error, soft-fail on extractor throw, missing-font warn, subtitle-read failure tolerated). Test count: 229 (was 190).

### Changed

- **`escapeSubtitlePath` → `escapeLibassPath`** — the helper handles both `subtitles=` and `fontsdir=` libass filter arguments now that the escape rules apply identically. Old names are kept as `@deprecated` aliases for one release so external call sites can migrate without a synchronised cut.
- **`EncodeJob` gains `fontsDir?: string`** — opt-in field; callers that don't set it produce the v0.4 filter chain byte-for-byte.

### Fixed

- **Font tempdir cleanup on every failure path** — the extractor now wraps the ffmpeg spawn + readdir in try/catch so spawn errors, non-0/1 exit codes, signal kills, readdir throws, and zero-files-produced all remove the temp dir before propagating. Previously a mid-extraction failure could leave `mkfont-*` directories behind in `os.tmpdir()`.
- **`\fn` regex matches both libass forms** — the missing-font diagnostic now catches the bare form (`\fnFontName`) as well as the parenthesized form (`\fn(FontName)`). Prior scan missed `{\fnArial}` overrides entirely.
- **Signal-killed ffmpeg surfaces a distinct error** — null exit code (process killed by signal) is now distinguished from a non-zero code so failures don't masquerade as "exit code null" in the job log.
- **`fontStem` switched to `path.parse(...).name`** — replaces the regex-based extension strip; correctly handles compound names like `Bauhaus 93.ttf` so the missing-font diagnostic matches the right filename.

### Known Limitations

- The missing-font diagnostic is best-effort string matching on the ASS file (`\fn(Name)` overrides, stem-matched against extracted basenames). It does **not** enumerate system fonts and cannot distinguish "missing on disk" from "present elsewhere on the system" — every warning reads as "may fall back to system default". Full system-font enumeration is deferred to v0.6.
- Soft-subbed mux (no burn-in, font attachments preserved in the output MKV) is still v0.6 territory.
- Embedded-font extraction runs per-job. A queue of 24 episodes from the same release will re-extract identical fonts 24 times — a `<userData>/fonts/<sourceHash>/` cache is on the v0.6 roadmap.

## [0.4.0] - 2026-05-05

Codec expansion release. HEVC and AV1 join H.264 across NVENC + software paths, with a per-codec preset editor, three quality tiers (Fast / Balanced / Pristine), custom presets that survive an app restart, and a benchmark mode that scores 2–4 candidate profiles on a 10-second sample with size, encode time, and PSNR.

### Added

- **HEVC encode path** — `hevc_nvenc` (10-bit main10) and `libx265` software encoder. NVENC main10 emits `format=yuv420p10le` upstream for the encoder; libx265 inherits source pixel format.
- **AV1 encode path** — `av1_nvenc` (RTX 40-series, gated by `gpu.probe()`'s per-encoder name list) and `libsvtav1` software encoder with integer `-preset 0..13`.
- **Discriminated-union `EncodingSettings`** — the shape is now tagged on `codec`, eliminating illegal combinations (`libx265 + AV1`, etc.) at compile time. Each branch carries only its valid hardware paths and codec-specific knobs (NVENC `pN`, libx265 preset family, SVT-AV1 0..13).
- **Per-codec Balanced presets** — H.264 CQ 19 / NVENC p4 (the v0.1 default), HEVC CQ 22 / 10-bit, AV1 CQ 28 / 10-bit. Plus per-codec Fast (lower CQ ceiling, p2) and Pristine (highest CQ ceiling, p7) tiers — nine presets total.
- **Settings → Encoding section** — codec radio, hardware-encoder picker (filtered against `gpu.probe()`), Fast/Balanced/Pristine quick-set buttons, CQ slider clamped + labelled per codec (libsvtav1 goes to 63, the rest stop at 51), per-encoder preset knob (NVENC pN / libx265 / SVT-AV1), 10-bit toggle for HEVC + AV1 NVENC, container picker. Settings persist as a single `encoding` profile blob in electron-store.
- **Settings → Custom presets section** — name + save the live encoding profile, apply it later in one click, delete entries. Up to 20 presets; names must be unique. Each entry carries `version: 1` from day one for forward-compat migrations.
- **Benchmark mode** — encodes a 10-second sample of a chosen video against 2–4 candidate profiles, reports per-row size, elapsed time, and PSNR (dB). Reachable from the Encoding section's "Run benchmark" button. Defaults to the user's currently-selected codec at Fast/Balanced/Pristine; an inline codec cycler lets the user promote a slot to a different codec to compare across families. Temp files live under `<userData>/benchmark/<runId>/` and clean up on completion.
- **`ffmpeg/psnr.ts`** — one-shot `-lavfi psnr` runner that parses `average:` from stderr; 60-second hard cap to bound a malformed candidate.
- **`encode/benchmark.ts`** — sequential candidate runner riding the existing `startEncode` orchestrator. Per-candidate failures surface in the result row rather than rejecting the whole run, so a single bad config doesn't lose the other rows.
- **`benchmark:run` IPC** — zod-validated tuple schema (max 4 candidates), dedicated event channels (`benchmark:progress`, `benchmark:log`).
- **`EncodeJob.clipWindow`** — optional `{ startSec, durationSec }` propagates into `-ss <start> -t <duration>` ahead of `-i`. Benchmark uses it; Single + Queue routes don't set it.
- **HEVC + MP4 mux flag** — `-tag:v hvc1` appended on the HEVC + MP4 combination so QuickTime / iOS pick up the stream as HEVC.
- **`defaultsFor(codec)` helper** — orchestrator picks the per-codec Balanced default before merging the partial override, so `Partial<DiscriminatedUnion>` can't silently corrupt cross-codec partials at the spread.
- **14 new vitest tests** — 10 in `args.test.ts` (hevc_nvenc / hevc + libx265 / av1_nvenc / libsvtav1 branches, 8-bit fallback, MKV-strips-hvc1, clipWindow plumbing) and 4 in `benchmark.test.ts` (sequential runs, candidate failures don't kill the run, candidate cap, zero-candidate no-op). Test count: 190 (was 176).

### Changed

- **`EncodingSettings` is now a discriminated union over `codec`** — every existing call site keeps compiling because the v0.1 H.264 NVENC defaults still satisfy the H.264 branch shape, but new code that touches partial overrides should call `defaultsFor(codec)` rather than spreading `BALANCED_PRESET` directly.
- **Filter chain pixel format is now codec-aware** — NVENC h264 still emits `format=yuv420p`; HEVC + AV1 NVENC emit `format=yuv420p10le` when `tenBit` is set. libx265 + libsvtav1 software branches don't force a pixel format and inherit from the source.
- **App.tsx** prefers the persisted `encoding` profile when present and falls back to the legacy onboarding-derived overrides only when the user hasn't opened the new Encoding section yet — no behavioural change for existing user flows.

### Known Limitations

- Custom preset import / export to JSON file isn't shipped — deferred to v0.5.
- Per-job overrides in the queue still aren't supported — every queue item uses the global `encoding` profile. Lands in v0.5 alongside import/export so the UI work happens together.
- Per-codec preflight bitrate estimate isn't shipped; preflight stays pinned to the H.264 number (2500 kbps) and over-reserves disk for HEVC/AV1. Safe direction for a guard.
- AV1 NVENC needs an RTX 40-series GPU. Pre-RTX-40 hardware sees the AV1 NVENC option disabled with a `requires RTX 40-series` tooltip; AV1 software (`libsvtav1`) is always available.
- Benchmark mode runs candidates sequentially. Parallel candidates are tractable (the orchestrator already supports concurrency) but the benchmark deliberately serialises so the timing numbers aren't contaminated by GPU contention.

### Maintenance

- **Toolchain bumps** — electron 41.2.1 → 42.0.1, vite 7 → 8 + `@vitejs/plugin-react` 4.7.0 → 6.0.2 (with `resolve.dedupe` + dropped `minify:'esbuild'` for vite 8 compat), vitest 3 → 4 in web + desktop (explicit `include` glob pinned for desktop), zod 3 → 4 in apps/desktop.
- **Node engine floor raised to `>=22.12.0`** to satisfy electron 42's runtime requirements.
- **Security fixes** — Phase 1 safe bumps + Phase 2 pnpm overrides clear 4 high-severity CVEs (`fast-uri <3.1.2`, `ip-address <10.1.1`, `devalue >=5.6.3 <5.8.1` pinned forward).

## [0.3.0] - 2026-05-04

Batch queue release. The Queue tab in the titlebar — dormant since v0.1 — now drives a real, persistent batch pipeline. Drop a folder of episodes, click Start, walk away.

### Added

- Queue screen with status pills (Wait / Live / Done / Error / Stopped), per-card mini progress bars, kanji-numbered positions, and a whole-screen drop overlay that auto-pairs every match it finds in one shot.
- Persistent queue at `<userData>/queue.json`. Atomic `writeFile(tmp) → rename` survives force-kill; the in-memory state debounce-flushes every 200ms and synchronously on `before-quit`.
- Boot recovery: items that were `active` at shutdown demote to `wait` and have their attempts counter reset; items whose source video or subtitle vanished off disk demote to `error` with `Source file missing`. The queue does not auto-resume — Start is always a deliberate user action.
- Soft-pause: clicking Pause halts the dispatcher and lets in-flight encodes finish naturally. The CTA reads `Pausing… (N item finishing)` while the drain is in progress, then `Paused` once everything settles. Resume picks up from the next waiting item.
- Concurrency cap (1–4 parallel encodes) wired through electron-store. Segmented control on the Queue screen mirrors the same setting; the orchestrator's cap follows the queue while it's running and reverts to 1 when the queue drains so the Single route's "another encode is already running" guarantee comes back unchanged.
- Per-item retry budget with exponential backoff: `queueMaxRetries` failed attempts (default 2) before an item flips to `error` and the queue moves on. Each retry waits `queueBackoffMs * 2^attempts` (default 4s base → 8s → 16s).
- Per-card actions: Force stop on `active` items (SIGTERM via the existing orchestrator path), Retry on `error` / `cancelled` items, Remove on anything else (with a click-twice-to-confirm guard).
- Native HTML5 drag-reorder. Active items have their drag handle suppressed so a mid-encode drop can't shuffle the running job.
- "Add pair" multi-file picker on both the Queue screen and the QueueSidebar — runs through the same auto-pair pipeline as drag-and-drop, so a 12-episode batch is one dialog open.
- Desktop notification when the queue drains — opt-out via the new `queueNotifyOnComplete` setting (default on).
- New `queueDefaultRoute` setting routes the app straight into the Queue screen on boot for power-users; default stays `single`.
- Per-item log viewer: every queue card has a chevron that drops an inline `ffmpeg · stderr` panel below the card. Auto-scrolls on append, ships a Copy button that pastes `[ts] text` lines into the clipboard for bug reports, and uses the same `LogLine` highlighter as the Single route. Session-scoped — closing the screen drops the expand state, matching the manager's policy of never persisting per-item logs to `queue.json`.
- Settings → Queue section: surfaces the persisted prefs that previously could only be poked from devtools — concurrency (mirrors the segmented control on the Queue screen), max retries (0–10), retry backoff (1–60s with the doubling sequence visible in the help text), notify-on-complete toggle, and default screen on launch (Single / Queue).
- Total-queue disk-space preflight at `Start queue`: sums estimated output bytes across every `wait` item grouped by output dir, surveys each unique dir for free space, throws `IpcError('UNAVAILABLE', …)` listing every shortfall in one go. Catches the "drop 12 episodes onto a 5 GiB partition and walk away" failure at the click instead of after the first 30-minute encode burns its time.
- 31 new vitest tests across `queue/manager.test.ts`, `queue/persistence.test.ts`, `queue/preflight.test.ts`, and `ipc/handlers/queue.test.ts` — concurrency dispatch, soft-pause, retries with fake backoff timers, atomic writes, boot recovery, queue-complete notification opt-out, total-queue preflight (empty queue / wait-only filtering / dir grouping / shortfall reporting / probe-failure tolerance).

### Changed

- The encode orchestrator's single-job lock at `startEncode` is now a configurable concurrency cap (`setConcurrencyCap`, default 1). Single-route behaviour is unchanged because the cap only rises while the queue manager is actively dispatching.
- The Single / Queue route switcher in the titlebar is finally wired — the markup has been there since v0.1, but the renderer never passed an `onRouteChange` callback.

### Known Limitations

- Queue logs are session-scoped (memory only, capped at 500 lines per item). Not persisted to disk — relaunching loses the per-item log buffer. By design.
- Per-item encoding overrides aren't supported — the whole queue uses the current global preset. Per-item editing lands in v0.4.0 with the advanced preset editor.
- Preflight rejection is surfaced today as a structured `console.error` in devtools. A user-facing toast / dialog lands in v0.3.1 — the renderer call sites already point at `lib/queue-errors.ts:reportQueueStartError` so the upgrade is a single-file swap.
- Embedded-font extraction from MKV attachments still TODO — v0.5.0.

## [0.2.0] - 2026-05-03

Drop-it-in release. The whole Idle screen is now a target — drag a video and a subtitle file (or a folder containing them) onto the window and Moekoder pre-fills the three ingredients without a single dialog.

### Added

- Whole-Idle drop overlay with a tinted veil and an 投 sigil; covers the screen, not just an inner card.
- Three-strategy filename auto-pairing (exact match → video-base contains subtitle-base → subtitle-base contains video-base) with word-boundary checks so `ep10.mkv` no longer mispairs with `ep1.ass` when the matching `ep10.ass` is missing.
- Folder drops scan their immediate children for media (non-recursive), surface videos + subtitles to the auto-pair pipeline, and route the folder itself to the output slot — drop one folder, all three slots fill.
- Inline candidates dropdown on the video and subtitle stages: when a drop produces multiple matches, a chevron next to the slot opens a swap menu so the user picks the right one without re-running the picker dialog. Built on Radix Popover with a portal-rendered, scrollable, collision-aware panel.
- Multi-select OS file picker (`dialog:open-files`) wired through to the same setter pipeline as drag-drop.
- New `fs:list-folder` IPC channel — extension-filtered, numeric-aware sort so `ep2` precedes `ep10` in the candidates list.
- Extended renderer file-format whitelist: video accepts `.mkv .mp4 .m4v .webm .avi .mov .ts .m2ts`, subtitle accepts `.ass .ssa .srt .vtt`. The same constants drive both drop classification and dialog filters.
- Output-override guard (`outUserDirty`): swapping the active video candidate no longer clobbers an output folder the user manually picked via the Output stage.
- `webUtils.getPathForFile` exposed via the preload bridge so drag-and-drop continues to resolve real filesystem paths under Electron's modern `contextIsolation` (the legacy `File.path` was removed in 32+).
- Vitest landed in `apps/web` for the first time, with 13 unit tests covering filename categorisation, the auto-pair matcher, and edge cases (numeric prefixes, case-insensitive matching, empty inputs).

### Changed

- File classification is now extension-only across the whole renderer — `File.type` was unreliable for `.ass` (often arrives as empty MIME) and `.mkv` (Linux-only on Chromium).
- Click and drop pipelines now share a single `setVideoFromPath` / `setSubsFromPath` / `setOutFromFolder` setter layer so the auto-output-folder derivation cannot drift between entry points.

### Known Limitations

- Same as v0.1.0: unsigned binaries, Windows-only auto-updater, no Linux build, single-file encode (queue lands in v0.3).

First public release. Moekoder is a tiny desktop app that hardsubs your MKV with its ASS and then gets out of your way, with a GPU-accelerated pipeline, presets that match the hardware you actually have, and zero network phoning home.

### Added

- Nine-step first-run wizard (Welcome → Theme → Engine → Hardware → Preset → Save → Container → Privacy → Done) that walks first-time users to a working encode in under a minute.
- Real ffmpeg auto-install on first launch (~180 MB, one-time) with live MB counter and SHA-256 verification before the binary is trusted.
- GPU probe that detects NVENC, QSV, and AMF at startup and recommends the fastest available encoder.
- Every wizard pick persists across runs and feeds the encode pipeline directly, so the second launch goes straight to idle.
- MKV + ASS to MP4 or MKV hardsub via libass through ffmpeg's `subtitles` filter, with three-layer Windows subtitle-path escaping so drive letters and colons survive the round trip.
- Video encoder selection spans NVENC, QSV, AMF, and a libx264 CPU fallback for machines without a supported GPU.
- Smart audio handling: stream-copy untouched by default, with automatic AAC 192k transcode only when the source codec (TrueHD, DTS, FLAC, or raw PCM) cannot be muxed into MP4.
- Bitrate-driven disk-space preflight warns before the encode starts instead of half-writing a file and failing.
- Live progress UI with ring, filmstrip, and rolling log showing fps, speed, bitrate, and ETA.
- Mid-encode cancel returns cleanly to idle without leaking a partial output file.
- Six themes (Plum default, Midnight, Matcha, Cosmic, Void, Paper) with live switching and persistence.
- Collapsible sidebar bound to Ctrl/Cmd+B, with collapse state persisted across runs.
- Rail stats surface the user's active encoding profile (save target, hardware encoder, codec + container) at a glance.
- Settings screen with theme picker, replay onboarding, and reinstall-ffmpeg action.
- Auto-updater on Windows via electron-updater.
- One-click reveal of the logs folder for bug reports.
- Windows x64 NSIS installer and macOS DMG build artefacts.
- Source-available license (see `LICENSE`) covering the full source tree.

### Known Limitations

- Binaries are unsigned. Windows SmartScreen will show "Run anyway" on first launch; macOS needs `xattr -cr /Applications/Moekoder.app` after install (see README).
- Linux builds are not shipped yet. They are on the roadmap.
- Auto-updater is Windows-only for now; macOS is waiting on a Developer ID certificate.
- Single-file encode only. Queue mode is planned for v0.3.
- No pause mid-encode on Windows. Cancel and restart instead.
