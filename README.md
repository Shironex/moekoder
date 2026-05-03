<a name="top"></a>

<div align="center">
  <img src="apps/desktop/build/icon.png" alt="Moekoder" width="128" height="128" />

  <h1>萌コーダー &nbsp;·&nbsp; Moekoder</h1>

  <p><strong>Burn subtitles into anime, cutely.</strong></p>

  <p>
    <a href="https://github.com/Shironex/moekoder/releases/latest">
      <img src="https://img.shields.io/github/v/release/Shironex/moekoder?style=flat&color=ec4899" alt="GitHub Release" />
    </a>
    <a href="https://github.com/Shironex/moekoder/releases">
      <img src="https://img.shields.io/github/downloads/Shironex/moekoder/total?style=flat&color=f472b6" alt="Downloads" />
    </a>
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey" alt="Platform" />
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-Source%20Available-orange" alt="License" />
    </a>
  </p>

  <p>
    <a href="https://github.com/Shironex/moekoder/releases/latest"><strong>Download</strong></a>
    &nbsp;·&nbsp;
    <a href="CHANGELOG.md"><strong>Changelog</strong></a>
  </p>

  <blockquote>
    <p>Moekoder is still warming up the encoder — the app is in early development. Some edges are rough, but every release brings the pipeline closer to ready.</p>
  </blockquote>
</div>

---

### What is Moekoder?

Moekoder is a desktop hardsub tool for people who keep their anime locally and care about the burn. Drop in an MKV and its ASS subtitle track, pick a save location, and Moekoder runs the full ffmpeg pipeline — subtitle rendering with libass, audio copy or smart AAC fallback, NVENC / QSV / libx264 depending on what your machine can do — and drops a playable MP4 next to the source. Built for people who already know what `CQ`, `NVENC`, and `libass` mean, but wrapped in a quiet dark-plum interface that stays out of the way.

Part of the **Shiro Suite** alongside [ShiroAni](https://github.com/Shironex/shiroani) (anime), [Shiranami](https://github.com/Shironex/shiranami) (music), and [KireiManga](https://github.com/Shironex/kirei-manga) (manga). The four siblings share design language, monorepo patterns, and the same late-night cozy mood.

### What's inside

|                            |                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hardsub encode**         | MKV + ASS → MP4 with subtitles burned in via libass, single job at a time                                                                                       |
| **FFmpeg manager**         | Auto-downloads the ffmpeg engine on first run (BtbN on Windows, evermeet.cx on macOS), verifies SHA-256, installs to your user-data directory — no manual setup |
| **Hardware encoder probe** | Detects NVENC / QSV / AMF on your machine and recommends the fastest option; CPU (libx264) is always a guaranteed fallback                                      |
| **Disk-space preflight**   | Bitrate-driven size estimate + safety margin checks your free space before the job starts                                                                       |
| **9-step onboarding**      | First launch walks you through theme, engine install, GPU detection, preset, save location, container, and privacy                                              |
| **Save targets**           | Sibling `moekoder/` folder, same folder as source, a dedicated "subbed" folder, or a custom path                                                                |
| **Six themes**             | Plum (default), Midnight, Matcha, Cosmic, Void, Paper — 11 more drip-fed across v0.2–v0.6                                                                       |
| **Live progress**          | Ring + filmstrip + rolling log with fps, speed, bitrate, and ETA                                                                                                |
| **Smart audio fallback**   | Lossless-in-MP4 streams auto-transcoded to AAC 192k; everything else is stream-copied untouched                                                                 |
| **Auto-updater**           | In-app updates on Windows; GitHub Releases link on macOS until code-signing lands                                                                               |
| **One-click logs**         | Reveal the logs folder in Finder / Explorer — the file transport captures everything the main process emits                                                     |
| **Reinstall ffmpeg**       | If the binaries look damaged, Settings reruns the install pipeline on one click                                                                                 |

### Getting started

Grab the latest build from [Releases](https://github.com/Shironex/moekoder/releases/latest).

#### Windows

1. Download the `.exe` installer.
2. Run it — Windows might show a SmartScreen warning since the app isn't code-signed. Click **"More info"** then **"Run anyway"**.
3. First launch walks you through onboarding (ffmpeg is fetched here, one-time ~180 MB).

#### macOS

1. Download the `.dmg` file.
2. Open it and drag Moekoder to your Applications folder.
3. macOS will block it because it's unsigned. Open Terminal and run:
   ```bash
   xattr -cr /Applications/Moekoder.app
   ```
   You'll need to run this after each update until code-signing lands.
4. First launch walks you through onboarding.

### Built with

|          |                                                        |
| -------- | ------------------------------------------------------ |
| Desktop  | Electron 41                                            |
| Frontend | React 18, Vite 7, Tailwind CSS 4                       |
| State    | Zustand 5                                              |
| UI       | Radix UI, Lucide Icons                                 |
| Landing  | Astro 6, Tailwind CSS 4                                |
| Encoding | FFmpeg (auto-downloaded, not bundled) + libass         |
| Store    | electron-store                                         |
| Updater  | electron-updater                                       |
| Logging  | @moekoder/shared logger (file transport in main)       |
| Archives | yauzl (zip extraction for the ffmpeg install pipeline) |
| Schemas  | zod (IPC boundary validation)                          |
| Quality  | ESLint, Prettier, Husky                                |
| Tests    | Vitest                                                 |
| CI/CD    | GitHub Actions, electron-builder                       |

### Building from source

You'll need [Node.js](https://nodejs.org/) >= 22.13 (see `.nvmrc`) and [pnpm](https://pnpm.io/) >= 10.

```bash
git clone https://github.com/Shironex/moekoder.git
cd moekoder
pnpm install
pnpm dev
```

`pnpm dev` starts the Vite renderer on `localhost:15180`, waits for it to come up, then launches Electron pointed at that URL.

<details>
<summary>All commands</summary>

```bash
pnpm dev                                      # Desktop + web
pnpm dev:landing                              # Astro landing page only
pnpm build                                    # Build web + desktop
pnpm build:landing                            # Build landing page
pnpm lint                                     # eslint
pnpm typecheck                                # Typecheck every workspace
pnpm test                                     # Desktop test suite (Vitest)
pnpm --filter @moekoder/desktop package       # Package for the host platform
pnpm --filter @moekoder/desktop package:win   # Package for Windows (NSIS)
pnpm --filter @moekoder/desktop package:mac   # Package for macOS (DMG)
pnpm generate-icons                           # Fan apps/desktop/resources/mascot.png into platform icons
pnpm version:patch                            # Bump version + tag (minor / major also available)
```

</details>

### Project structure

```
moekoder/
├── apps/
│   ├── desktop/              # Electron main process (esbuild-bundled)
│   │   ├── src/main/         # Bootstrap, window, CSP, logger, updater
│   │   │   ├── ffmpeg/       # Manager, probe, args, output parser, processor
│   │   │   ├── encode/       # Orchestrator — one job at a time, IPC event routing
│   │   │   └── ipc/          # Typed handlers, zod schemas, error contract
│   │   ├── resources/        # Source mascot PNG (feeds generate-icons)
│   │   └── build/            # Generated app icons + electron-builder output
│   ├── landing/              # Astro landing page (moekoder.app)
│   └── web/                  # React + Vite renderer
│       ├── src/screens/      # Splash, Idle, Encoding, Done, Settings, About, onboarding/
│       ├── src/stores/       # Zustand stores (app view, encode state, onboarding)
│       └── src/styles/       # tokens.css, base.css, primitives.css, chrome.css
├── packages/
│   └── shared/               # Types, IPC channels, logger, theme tokens, constants
├── scripts/                  # bump-version, generate-icons
└── docs/                     # Roadmaps, design notes (gitignored)
```

### Roadmap

| Milestone              | Scope                                                                                      | Status         |
| ---------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| **v0.1 — Hardsub MVP** | MKV + ASS → MP4, onboarding, FFmpeg manager, GPU probe, six themes                         | 🚧 in progress |
| v0.2 — Drag & Drop     | Drag-drop auto-pairing, multi-file picker, +3 themes (Dawn drop: Sakura, Haiku, Shirogane) | planned        |
| v0.3 — Batch Queue     | Queue screen, JSON persistence, retries                                                    | planned        |
| v0.4 — Codec Expansion | HEVC + AV1, advanced preset editor                                                         | planned        |
| v0.5 — Embedded Fonts  | Extract attachments from the source MKV so libass renders the intended typefaces           | planned        |
| v0.6 — Soft-sub Mux    | MKV-out, copy streams, no re-encode path                                                   | planned        |
| v0.7+ — Polish         | Crash report clipboard, portable zip build, Linux AppImage, richer landing                 | backlog        |

---

## License

Moekoder Source Available License — see [LICENSE](LICENSE). Personal use and contributions via pull requests are permitted; redistribution, reselling, and derivative works are not.

## Credits

Moekoder stands on the shoulders of the Shiro Suite — design and architectural patterns are descended from [ShiroAni](https://github.com/Shironex/shiroani), [Shiranami](https://github.com/Shironex/shiranami), and [KireiManga](https://github.com/Shironex/kirei-manga). The encoding engine is [FFmpeg](https://ffmpeg.org) ([BtbN builds](https://github.com/BtbN/FFmpeg-Builds) on Windows, [evermeet.cx](https://evermeet.cx/ffmpeg/) on macOS); subtitle rendering is handled by [libass](https://github.com/libass/libass).

<p align="right"><a href="#top">Back to top ↑</a></p>
