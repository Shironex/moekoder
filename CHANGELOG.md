# Changelog

All notable changes to Moekoder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-20

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

## [Unreleased]
