import satori from 'satori';
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/* ------------------------------------------------------------------
   萌コーダー · Moekoder OG image generator.

   Renders a 1200×630 Twitter/Discord/Open Graph card via satori (SVG
   with embedded font glyphs) then flattens to PNG via sharp.

   Composition mirrors the KireiManga sibling script:
     · left column  — eyebrow · title · subhead · rule · meta strip
     · right column — 夜 hanko seal (top) + mascot (bottom)
     · background   — giant faded 夜 tucked top-right

   Fonts (Fraunces + Shippori Mincho) are auto-fetched on first run
   into assets/fonts/ (gitignored) so the repo stays small.
------------------------------------------------------------------ */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const fontsDir = resolve(root, 'assets/fonts');
const outPath = resolve(root, 'public/og-default.png');
const mascotPath = resolve(root, 'public/assets/mascot.png');

const FONTS = [
  {
    family: 'Fraunces',
    weight: 600,
    style: 'normal',
    file: 'Fraunces144pt-SemiBold.ttf',
    url: 'https://github.com/undercasetype/Fraunces/raw/master/fonts/ttf/Fraunces144pt-SemiBold.ttf',
  },
  {
    family: 'Shippori Mincho',
    weight: 700,
    style: 'normal',
    file: 'ShipporiMincho-Bold.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/shipporimincho/ShipporiMincho-Bold.ttf',
  },
];

/* Plum palette — roughly mirrors the app's Midnight→Plum default
   tokens from packages/shared/src/themes/plum.ts, converted from
   OKLCH to sRGB hex. Keep in sync when the theme shifts. */
const PLUM_BG = '#1a1421';
const PLUM_RAISED = '#241a2e';
const CREAM = '#f5ebdc';
const MUTED = '#b8a3c2';
const FAINT = '#7c6a87';
const HOT_PINK = '#e66b9e';
const RULE = '#3a2e45';

async function ensureFont({ url, file }) {
  await mkdir(fontsDir, { recursive: true });
  const localPath = resolve(fontsDir, file);
  if (existsSync(localPath)) return readFile(localPath);
  process.stdout.write(`  · fetching ${file} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(localPath, buf);
  console.log(`${(buf.length / 1024).toFixed(0)} KB`);
  return buf;
}

async function dataUri(path) {
  const buf = await readFile(path);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

console.log('• preparing fonts');
const fonts = await Promise.all(
  FONTS.map(async f => ({
    name: f.family,
    data: await ensureFont(f),
    weight: f.weight,
    style: f.style,
  }))
);

console.log('• loading mascot');
const mascot = await dataUri(mascotPath);

const markup = {
  type: 'div',
  props: {
    style: {
      width: '1200px',
      height: '630px',
      display: 'flex',
      position: 'relative',
      background: PLUM_BG,
      fontFamily: 'Fraunces',
      color: CREAM,
    },
    children: [
      // Giant faded 夜 ornament behind everything, top-right
      {
        type: 'div',
        props: {
          style: {
            position: 'absolute',
            top: '-140px',
            right: '-80px',
            fontFamily: 'Shippori Mincho',
            fontSize: '720px',
            fontWeight: 700,
            color: PLUM_RAISED,
            lineHeight: 1,
            display: 'flex',
          },
          children: '夜',
        },
      },

      // Inner padding frame
      {
        type: 'div',
        props: {
          style: {
            position: 'relative',
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '76px 88px',
          },
          children: [
            // Left column — editorial masthead
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  width: '680px',
                  height: '100%',
                },
                children: [
                  // Eyebrow row
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '18px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Shippori Mincho',
                              fontSize: '24px',
                              fontWeight: 700,
                              color: HOT_PINK,
                              letterSpacing: '6px',
                              display: 'flex',
                            },
                            children: '萌コーダー',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '56px',
                              height: '1px',
                              background: RULE,
                              display: 'flex',
                            },
                            children: '',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Fraunces',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: MUTED,
                              letterSpacing: '4px',
                              display: 'flex',
                            },
                            children: '§ DESKTOP HARDSUB TOOL',
                          },
                        },
                      ],
                    },
                  },
                  // Title + subhead + rule
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '22px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Fraunces',
                              fontSize: '124px',
                              fontWeight: 600,
                              letterSpacing: '-4px',
                              lineHeight: 0.95,
                              color: CREAM,
                              display: 'flex',
                            },
                            children: 'Moekoder',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontFamily: 'Fraunces',
                              fontSize: '32px',
                              fontWeight: 600,
                              color: MUTED,
                              lineHeight: 1.3,
                              display: 'flex',
                            },
                            children: 'Burn subtitles into anime, cutely.',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: '88px',
                              height: '2px',
                              background: HOT_PINK,
                              marginTop: '6px',
                              display: 'flex',
                            },
                            children: '',
                          },
                        },
                      ],
                    },
                  },
                  // Meta strip
                  {
                    type: 'div',
                    props: {
                      style: {
                        fontFamily: 'Fraunces',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: FAINT,
                        letterSpacing: '3px',
                        display: 'flex',
                      },
                      children: 'MKV  ·  ASS  ·  MP4  ·  NVENC / QSV / CPU  ·  LIBASS',
                    },
                  },
                ],
              },
            },

            // Right column — hanko seal (top) + mascot (bottom)
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  marginLeft: 'auto',
                  height: '100%',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '112px',
                        height: '112px',
                        background: HOT_PINK,
                        fontFamily: 'Shippori Mincho',
                        fontSize: '76px',
                        fontWeight: 700,
                        color: PLUM_BG,
                        transform: 'rotate(-4deg)',
                        boxShadow: '0 0 0 2px rgba(230,107,158,0.15)',
                      },
                      children: '夜',
                    },
                  },
                  {
                    type: 'img',
                    props: {
                      src: mascot,
                      width: 280,
                      height: 280,
                      style: { objectFit: 'contain' },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  },
};

console.log('• rendering svg');
const svg = await satori(markup, {
  width: 1200,
  height: 630,
  fonts,
});

console.log('• flattening to png');
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(outPath);

const { size } = await sharp(outPath).metadata();
console.log(
  `✓ generated ${outPath.replace(root + '\\', '').replace(root + '/', '')} (1200×630, ${size ?? ''})`
);
