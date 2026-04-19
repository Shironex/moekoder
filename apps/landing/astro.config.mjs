// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.MOEKODER_SITE_URL ?? 'https://moekoder.app',
  integrations: [react(), sitemap()],
});
