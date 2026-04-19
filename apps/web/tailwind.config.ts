import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Shippori Mincho', 'Zen Old Mincho', 'serif'],
        mono: ['JetBrains Mono', 'Iosevka', 'ui-monospace', 'monospace'],
      },
    },
  },
} satisfies Config;
