// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  srcDir: './frontend',
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],

  vite: {
    // @ts-expect-error - Vite plugin type mismatch between v6 and v7
    plugins: [tailwindcss()],
    ssr: {
      external: ['cloudflare:workers', 'cloudflare:email', 'cloudflare:sockets']
    }
  }
});