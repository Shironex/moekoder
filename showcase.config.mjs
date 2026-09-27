// README, portfolio and hero images for Moekoder, captured with
// @noctcore/showcase-kit. Regenerate everything with `pnpm showcase`.
//
// The capture runs the web renderer alone, without Electron or ffmpeg:
// `vite build --mode showcase` boots through apps/web/src/showcase/entry.ts,
// which installs a fake window.electronAPI (typed against
// apps/web/src/types/electron-api.d.ts, so preload drift fails tsc) and a
// window.__moekoderShowcase handle the shots below use to play encode
// events. Every file name, the queue, the GPU probe and the ffmpeg version on
// screen are invented in apps/web/src/showcase. No other build mode includes
// any of it.
//
// Determinism: the clock is frozen, every request outside the local preview
// server is blocked, the user agent is pinned to Windows (lib/platform.ts
// reads it once at load, and a Mac user agent swaps the custom title bar for
// native traffic lights) and the language is seeded before a reload. The kit
// itself disables animations and waits for fonts before every shot. Fonts
// fall back to the system faces, so a capture on macOS differs slightly from
// one on Windows.
//
// Outputs:
// - showcase-out/raw/<lang>/<id>.png: plain captures, gitignored scratch.
// - assets/showcase/<lang>/<id>.webp: framed images for README.md and README.pl.md.
// - assets/showcase/hero.<lang>.webp: README banners, one per language
//   (scripts/showcase-extras.mjs, which also prints the README tables).
// - $SHOWCASE_PORTFOLIO_DIR: portfolio images, only when the variable is set.
//   It names the final folder (for example
//   ../portfolio/public/projects/moekoder). The export writes <id>.webp and
//   thumbnail.webp there and never deletes anything.
import { defineConfig } from '@noctcore/showcase-kit';

/** Not the dev server's 15180, so a running `pnpm dev` is never captured. */
const PORT = 15190;
const ORIGIN = `http://localhost:${PORT}`;

/** Sunday 2026-09-27, 20:00 local time. */
const FROZEN_NOW = new Date(2026, 8, 27, 20, 0, 0);

const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/** Moekoder's plum primary (--primary in tokens.css) into its dark plum. */
const BACKGROUND = { type: 'gradient', from: '#F37FB0', to: '#140E1D', angle: 135 };

const portfolioDir = process.env.SHOWCASE_PORTFOLIO_DIR;

/**
 * Polish captions and tagline for README.pl.md and the Polish hero. The kit
 * keeps one caption per shot, so scripts/showcase-extras.mjs swaps these in.
 */
export const LOCALIZED = {
  pl: {
    tagline: 'Wypalaj napisy w anime, uroczo.',
    shots: {
      onboarding: {
        title: 'Pierwsze uruchomienie',
        caption: 'Kreator wykrywa kartę graficzną i sam instaluje ffmpeg.',
      },
      idle: {
        title: 'Gotowe do kodowania',
        caption: 'Wybierz wideo i napisy, a potem kliknij Rozpocznij kodowanie.',
      },
      encoding: {
        title: 'Kodowanie',
        caption:
          'Pierścień postępu, taśma klatek i log ffmpeg z fps, prędkością i pozostałym czasem.',
      },
      done: {
        title: 'Gotowe',
        caption: 'Gotowy plik z czasem trwania, średnim fps, rozmiarem i prędkością.',
      },
      queue: {
        title: 'Kolejka',
        caption: 'Cały sezon w kolejce, dwa odcinki kodowane jednocześnie.',
      },
      'settings-appearance': {
        title: 'Wygląd',
        caption: 'Sześć motywów i język interfejsu, zmieniane od razu.',
      },
      'settings-encoding': {
        title: 'Ustawienia kodowania',
        caption: 'H.264, HEVC lub AV1, enkoder sprzętowy i poziom jakości.',
      },
      extract: {
        title: 'Wyodrębnianie napisów',
        caption: 'Osadzone ścieżki napisów z pliku MKV, zapisane jako ASS lub SRT.',
      },
    },
  },
};

/** Take the pointer and keyboard focus off whatever was just clicked. */
async function park(page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

/** Click a data-testid target, then park. */
function click(testId) {
  return async page => {
    await page.locator(`[data-testid="${testId}"]`).first().click();
    await park(page);
  };
}

/** Press the onboarding wizard's primary button `times` times. */
async function wizardNext(page, times) {
  for (let i = 0; i < times; i++) {
    await page.locator('[data-testid="onboarding-next"]').click();
  }
}

export default defineConfig({
  name: 'Moekoder',
  slug: 'moekoder',
  target: {
    mode: 'url',
    url: ORIGIN,
    start: `pnpm exec vite build --mode showcase --outDir dist-showcase && pnpm exec vite preview --outDir dist-showcase --port ${PORT} --strictPort`,
    cwd: 'apps/web',
    readyTimeoutMs: 180000,
    reuseExisting: false,
  },
  // The title bar mounts once the boot splash hands over to the app.
  ready: '[data-testid="app-ready"]',
  // The desktop window's default size (apps/desktop/src/main/window.ts).
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  // The kit cancels infinite animations before each screenshot. The
  // onboarding watermark only gets its faint opacity from its keyframes, so
  // pin it to its first frame instead of letting it render at full strength.
  css: '.moekoder-ob-breathe { animation: none !important; opacity: 0.045; }',
  langs: ['en', 'pl'],
  setup: async ({ page, context, lang }) => {
    await context.route(
      url => !url.href.startsWith(ORIGIN) && !url.href.startsWith('data:'),
      route => route.abort()
    );
    await context.addInitScript(ua => {
      Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
    }, WINDOWS_UA);
    await page.clock.setFixedTime(FROZEN_NOW);
    await page.evaluate(language => {
      localStorage.clear();
      localStorage.setItem('moekoder.uiLanguage', language);
    }, lang);
    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-testid="app-ready"]').waitFor({ state: 'attached', timeout: 60000 });
    const ua = await page.evaluate(() => navigator.userAgent);
    if (ua !== WINDOWS_UA) throw new Error(`User agent pin did not apply, got: ${ua}`);
  },
  // One page per language, in this order: each shot starts where the last
  // one left off. The fixture store starts with onboarding not completed.
  shots: [
    {
      id: 'onboarding',
      title: 'First launch',
      caption: 'The setup wizard detects your GPU and installs ffmpeg for you.',
      // welcome -> theme -> engine -> hardware
      nav: async page => {
        await wizardNext(page, 3);
        await park(page);
      },
      waitFor: 'text=NVIDIA NVENC',
    },
    {
      id: 'idle',
      title: 'Ready to encode',
      caption: 'Pick a video and its subtitles, then press Begin encode.',
      // hardware -> preset -> save -> container -> privacy -> done -> finish,
      // then pick both files; the output folder derives from the video.
      nav: async page => {
        await wizardNext(page, 6);
        await page.locator('[data-testid="sidebar-pick-video"]').click();
        await page.locator('[data-testid="sidebar-pick-subs"]').click();
        await park(page);
      },
      waitFor: '[data-testid="sidebar-cta-begin"]:enabled',
    },
    {
      id: 'encoding',
      title: 'Encoding',
      caption: 'A progress ring, a filmstrip and the ffmpeg log with fps, speed and ETA.',
      nav: async page => {
        await page.locator('[data-testid="sidebar-cta-begin"]').click();
        await page.locator('[data-testid="sidebar-cta-begin"][aria-busy="true"]').waitFor();
        await page.evaluate(() => {
          const showcase = window.__moekoderShowcase;
          const now = Date.now();
          const lines = [
            'Stream mapping:',
            '  Stream #0:0 -> #0:0 (h264 (native) -> h264 (h264_nvenc))',
            '  Stream #0:1 -> #0:1 (copy)',
            "Output #0, mp4, to 'Frostbound Requiem - 01 [Moonlark] [1080p].mp4':",
            '  Stream #0:0: Video: h264 (Main), yuv420p, 1920x1080, q=19, 23.98 fps',
            '  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp',
          ];
          lines.forEach((text, i) => {
            showcase.emitEncodeLog({ ts: now - 160_000 + i * 40, level: 'info', text });
          });
          showcase.emitEncodeProgress({
            pct: 62,
            fps: 134.2,
            bitrateKbps: 5120,
            speed: 5.6,
            outTimeSec: 896,
            etaSec: 98,
          });
        });
        await park(page);
      },
      waitFor: 'text=62.0%',
    },
    {
      id: 'done',
      title: 'Done',
      caption: 'The finished file with its duration, average fps, size and speed.',
      nav: async page => {
        await page.evaluate(() => {
          window.__moekoderShowcase.emitEncodeComplete({
            file: 'D:\\Anime\\Frostbound Requiem\\moekoder\\Frostbound Requiem - 01 [Moonlark] [1080p].mp4',
            durationSec: 1445,
            bytes: 1_006_000_000,
            avgFps: 136,
          });
        });
        await park(page);
      },
      waitFor: 'text=959 MB',
    },
    {
      id: 'queue',
      title: 'Queue',
      caption: 'A whole season in the queue, two episodes encoding at once.',
      nav: click('titlebar-route-queue'),
      waitFor: 'text=Paper Moon Diaries - 05',
    },
    {
      id: 'settings-appearance',
      title: 'Appearance',
      caption: 'Six themes and the interface language, applied as you pick them.',
      // Back to the Single route first, so the title bar tab matches.
      nav: async page => {
        await page.locator('[data-testid="titlebar-route-single"]').click();
        await page.locator('[data-testid="titlebar-settings"]').click();
        await park(page);
      },
      waitFor: '[data-testid="settings-section-appearance"]',
    },
    {
      id: 'settings-encoding',
      title: 'Encoding settings',
      caption: 'H.264, HEVC or AV1, the hardware encoder and a quality tier.',
      // Still on Settings: scroll the Encoding section to the top of the
      // body. Only the body scrolls; scrollIntoView would also shift the
      // overflow-hidden page around it and push the header out of view.
      nav: async page => {
        await page.locator('[data-testid="settings-section-encoding"]').evaluate(section => {
          const body = section.closest('.overflow-y-auto');
          const offset = section.getBoundingClientRect().top - body.getBoundingClientRect().top;
          body.scrollTop += offset - 32;
        });
        await park(page);
      },
      waitFor: 'text=NVENC (GPU)',
    },
    {
      id: 'extract',
      title: 'Subtitle extraction',
      caption: 'Embedded subtitle tracks from an MKV, saved as ASS or SRT.',
      nav: async page => {
        await page.locator('[data-testid="titlebar-extract"]').click();
        await page.locator('[data-testid="extract-pick-source"]').click();
        await park(page);
      },
      waitFor: 'text=Signs & Songs [Moonlark]',
    },
  ],
  frame: {
    // The capture already shows the app's own title bar, so no second frame.
    style: 'none',
    theme: 'dark',
    background: BACKGROUND,
    padding: 72,
    radius: 14,
    shadow: true,
    maxWidth: 1800,
  },
  hero: {
    layout: 'stack',
    tagline: 'Burn subtitles into anime, cutely.',
    logo: 'apps/desktop/build/icon.png',
    shots: ['idle', 'encoding', 'queue'],
    lang: 'en',
    output: 'assets/showcase/hero.{lang}.webp',
    background: BACKGROUND,
    theme: 'dark',
  },
  outputs: {
    raw: 'showcase-out/raw/{lang}/{id}.png',
    readme: 'assets/showcase/{lang}/{id}.webp',
    ...(portfolioDir
      ? {
          portfolio: {
            dir: portfolioDir,
            size: [1920, 1080],
            format: 'webp',
            thumbnail: 'idle',
            lang: 'en',
            gallery: false,
          },
        }
      : {}),
  },
});
