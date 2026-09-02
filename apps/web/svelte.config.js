import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA build: one fallback index.html, everything rendered client-side
    // (ssr = false in src/routes/+layout.ts).
    adapter: adapter({
      fallback: "index.html",
    }),
  },
};

export default config;
