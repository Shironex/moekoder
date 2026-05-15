#!/usr/bin/env node
/**
 * Attach to a running Electron app via CDP (--remote-debugging-port=9222),
 * screenshot each top-level screen by driving the titlebar buttons.
 *
 * Pre-req: app launched with `electron . --remote-debugging-port=9222`
 */
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const { chromium } = await import(PW);
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const OUT = resolve(process.cwd(), 'assets/screenshots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
const page =
  context.pages().find(p => p.url().startsWith('http://localhost:15180')) ??
  context.pages().find(p => !p.url().startsWith('devtools://'));

if (!page) {
  console.error('no renderer page found on CDP');
  process.exit(1);
}

console.log('attached to:', page.url(), '·', await page.title());

async function shot(name) {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log('  ->', file);
}

await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(1500); // let splash transition to idle

// Go back to Idle if Settings is open (Back button)
try {
  await page.getByRole('button', { name: /^back$/i }).click({ timeout: 1500 });
  await page.waitForTimeout(400);
} catch { /* not on settings */ }

// Ensure Single route is active
try {
  await page.getByRole('button', { name: /^single$/i }).click({ timeout: 1500 });
  await page.waitForTimeout(400);
} catch { /* already there or button not found */ }

// 1. Idle
await shot('idle');

// 2. Queue route
try {
  await page.getByRole('button', { name: /^queue$/i }).click({ timeout: 3000 });
  await page.waitForTimeout(500);
  await shot('queue');
} catch (e) {
  console.warn('skip queue:', e.message);
}

// 3. Settings → Appearance
try {
  await page.locator('[title="Settings"]').first().click({ timeout: 3000 });
  await page.waitForTimeout(600);
  await shot('settings-appearance');
} catch (e) {
  console.warn('skip settings:', e.message);
}

// 4. Settings → Encoding (scroll the v0.4 codec panel into view).
try {
  const encHeading = page.getByRole('heading', { name: /^encoding$/i }).first();
  await encHeading.scrollIntoViewIfNeeded({ timeout: 3000 });
  await page.waitForTimeout(400);
  await shot('settings-encoding');
} catch (e) {
  console.warn('skip settings-encoding:', e.message);
}

// Disconnect (do NOT close — that would kill Electron)
await browser.close();
console.log('done.');
