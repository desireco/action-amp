// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
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
    ]
  },

  integrations: [mdx(), sitemap()],

  adapter: node({
    mode: 'standalone'
  })
});
