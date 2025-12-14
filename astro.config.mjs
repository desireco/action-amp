// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  vite: {
    plugins: [
      tailwindcss(),
      Icons({
        compiler: 'astro',
        autoInstall: false
      })
    ],
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "./src"),
      },
    },
  },

  integrations: [mdx(), react(), sitemap()],

  adapter: node({
    mode: 'standalone'
  }),

  server: {
    port: 4000
  }
});
