import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.MOEKODER_SITE_URL ?? 'https://moekoder.app',
});
