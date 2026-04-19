#!/usr/bin/env node
/**
 * Generate desktop app icons from a source mascot PNG.
 *
 * Source : apps/desktop/resources/mascot.png (1024x1024+, transparent bg)
 * Output : apps/desktop/build/
 *   - icon-16.png, icon-32.png, icon.png (1024x1024)  — Linux / splash
 *   - icon.ico                                         — Windows (multi-res)
 *   - icon.icns                                        — macOS (skipped on non-Darwin)
 *
 * macOS .icns generation requires `iconutil`, which ships with Xcode and is
 * only available on Darwin. On other hosts the script emits a note and
 * leaves the .icns slot unfilled — the CI macOS runner regenerates when it
 * builds the DMG.
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sourceDir = resolve(root, 'apps/desktop/resources');
const outDir = resolve(root, 'apps/desktop/build');
const source = resolve(sourceDir, 'mascot.png');

mkdirSync(outDir, { recursive: true });

if (!existsSync(source)) {
  console.error(`Source mascot not found at: ${source}`);
  console.error('Drop a 1024x1024 PNG with transparent background there and retry.');
  process.exit(1);
}

const sizes = [16, 32, 1024];
const pngOptions = { compressionLevel: 9, palette: true, effort: 10, quality: 80 };

async function generate() {
  console.log('Generating app icons from mascot.png...\n');

  // Sized PNGs
  for (const size of sizes) {
    const outPath = resolve(outDir, size === 1024 ? 'icon.png' : `icon-${size}.png`);
    await sharp(source)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png(pngOptions)
      .toFile(outPath);
    console.log(`  icon${size === 1024 ? '' : `-${size}`}.png  (${size}x${size})`);
  }

  // Windows .ico (multi-res)
  const icoSizes = [16, 32, 48, 256];
  const icoPngs = await Promise.all(
    icoSizes.map(size =>
      sharp(source)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png(pngOptions)
        .toBuffer()
    )
  );
  const icoBuffer = await pngToIco(icoPngs);
  writeFileSync(resolve(outDir, 'icon.ico'), icoBuffer);
  console.log(`  icon.ico       (multi-res: ${icoSizes.join(', ')})`);

  // macOS .icns — Darwin only (iconutil is Xcode-bundled).
  if (platform() === 'darwin') {
    await generateIcns();
  } else {
    console.log('\n  icon.icns     SKIPPED (iconutil requires macOS)');
    console.log('  macOS CI runner will regenerate on release.');
  }

  console.log('\nDone!');
}

async function generateIcns() {
  const iconset = mkdtempSync(join(tmpdir(), 'moekoder-iconset-'));
  const iconsetDir = resolve(iconset, 'icon.iconset');
  mkdirSync(iconsetDir, { recursive: true });

  const icnsSizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];

  for (const [size, name] of icnsSizes) {
    await sharp(source)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png(pngOptions)
      .toFile(resolve(iconsetDir, name));
  }

  try {
    execFileSync('iconutil', ['-c', 'icns', '-o', resolve(outDir, 'icon.icns'), iconsetDir], {
      stdio: 'inherit',
    });
    console.log('  icon.icns      (via iconutil)');
  } finally {
    rmSync(iconset, { recursive: true, force: true });
  }
}

generate().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
