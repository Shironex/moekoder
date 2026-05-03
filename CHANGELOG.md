# Changelog

All notable changes to Moekoder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
