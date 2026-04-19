import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';
import { VITE_DEV_PORT } from '@moekoder/shared';

export default defineConfig({
  base: './',
  plugins: [react(), tailwind()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: VITE_DEV_PORT, strictPort: true },
});
