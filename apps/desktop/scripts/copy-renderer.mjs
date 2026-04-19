#!/usr/bin/env node
/**
 * Copies the built web renderer into the desktop dist/ so electron-builder
 * can package it. Runs as the last step of `pnpm --filter @moekoder/desktop
 * build`, after esbuild has emitted the main-process bundle.
 *
 * Source: apps/web/dist        (Vite build output)
 * Dest:   apps/desktop/dist/renderer
 *
 * Idempotent — removes the previous renderer/ dir before copying so stale
 * files from a prior build don't leak into the installer.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = join(__dirname, '../../web/dist');
const dest = join(__dirname, '../dist/renderer');

if (!existsSync(source)) {
  console.error(`[copy-renderer] Web build not found at: ${source}`);
  console.error('[copy-renderer] Run `pnpm --filter @moekoder/web build` first.');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });
console.log(`[copy-renderer] Copied ${source} -> ${dest}`);
