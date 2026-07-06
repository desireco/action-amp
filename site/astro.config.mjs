// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// `site` is required for sitemap generation + canonical URLs.
// Prod: https://actionamp.com. Local dev ignores this (dev server stays on :4321).
export default defineConfig({
  site: "https://actionamp.com",
  integrations: [sitemap()],
  // Cloudflare Pages serves static files; Astro's default static output is what we want.
  output: "static",
  trailingSlash: "ignore",
});
